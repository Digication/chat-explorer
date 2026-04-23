# Phase 07 — CSV Sanitization (Pre-Upload Cleanup)

You are running a one-time pre-upload sanitization pass on the actual 75 MB CSV file that this entire plan was written to handle.

**Context:** The Digication AI chat report export produces files with "smart" Unicode characters (curly quotes, em/en dashes, non-breaking hyphens, zero-width spaces) and sometimes already-corrupted U+FFFD replacement characters. In Chat Explorer these render as black-diamond question marks and make the imported content effectively unreadable. The project already has a user-invocable skill — **`/fix-csv`** — that does a CSV-aware find-and-replace on these characters and writes a cleaned file with a `-fixed.csv` suffix. The skill and its Python script live at `.claude/skills/fix-csv/SKILL.md`.

**Why this is its own phase:** Phases 01–06 make the server tolerant of large files and add the test pyramid that proves it. But a clean ingestion of bad data still leaves bad data in the database. The user flagged this explicitly: "Otherwise, this project, even when I finish updating and re-uploading the file, will still have all the bad data in it." So we sanitize **before** the real upload in phase 08.

**Scope note:** This is a one-time manual fix for this specific file. The long-term fix is upstream — the Digication exporter should emit clean UTF-8. Building server-side sanitization into Chat Explorer's upload pipeline is explicitly **out of scope** for this plan; the `/fix-csv` skill exists exactly because that root fix hasn't happened yet. When / if the exporter is fixed, this phase becomes unnecessary.

## Overview

- Locate the file the user is trying to upload (`~/Downloads/ai-chat-report-7255-2026-04-22.csv` or wherever the user has it).
- Invoke the `/fix-csv` skill via the Skill tool, passing the file path as the argument.
- Verify the output has no remaining U+FFFD characters and the row count is preserved (using a CSV-aware row counter, NOT `wc -l` — quoted fields can contain newlines).
- Leave the `-fixed.csv` in place for phase 08 to consume.

## Steps

### 1. Confirm the target file

**Commands:**

```bash
# The plan was written against this specific file. Confirm it's still there.
FILE="$HOME/Digication Dropbox/Jeffrey Yan/Mac (2)/Downloads/ai-chat-report-7255-2026-04-22.csv"
ls -lh "$FILE"
```

Expected: ~75 MB file exists. If the user has moved it, get the new path and use that — this phase is about cleaning the real file they want to upload, wherever it lives.

**Quick signal of how bad the encoding is** — run this to count problem characters (safe, read-only):

```bash
# Count U+FFFD (already-corrupted) chars — these are the ones that render
# as black diamonds in the UI today.
python3 -c "
import sys
with open('$FILE', 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8', errors='replace')
print('U+FFFD count:', text.count('\uFFFD'))
print('U+2019 (curly apostrophe):', text.count('\u2019'))
print('U+2014 (em dash):', text.count('\u2014'))
print('U+2013 (en dash):', text.count('\u2013'))
"
```

Record those counts. After fixing, they should be zero (or close to zero — `/fix-csv` handles curly chars exhaustively; U+FFFD is inferred from context and edge cases may remain).

### 2. Invoke the `/fix-csv` skill

The agent executing this phase invokes the skill directly via the `Skill` tool. Concretely:

```
Skill({
  skill: "fix-csv",
  args: "/Users/jeffreyyan/Digication Dropbox/Jeffrey Yan/Mac (2)/Downloads/ai-chat-report-7255-2026-04-22.csv"
})
```

The skill (defined in `.claude/skills/fix-csv/SKILL.md`) reads the CSV with a CSV-aware Python parser, applies the character replacements documented in the skill's table, and writes the cleaned file with a `-fixed.csv` suffix in the same directory. The original is not modified.

If the skill is unavailable (e.g., the agent is not running inside Claude Code), fall back to running the Python script from `.claude/skills/fix-csv/SKILL.md` manually:

```bash
# One-time, do not commit. Copy the Python "Fix Script" block from
# .claude/skills/fix-csv/SKILL.md into a local temp file, replace
# FILE_PATHS_HERE at the bottom with the actual path, run it, then delete.
python3 /tmp/fix-csv-once.py
rm /tmp/fix-csv-once.py
```

**Output location:** `ai-chat-report-7255-2026-04-22-fixed.csv` in the same directory as the input.

**Expected skill output (roughly):**

```
ai-chat-report-7255-2026-04-22.csv:
  Characters fixed: <count> (<count> were already-corrupted)
  Output: <row_count> rows, 60 columns
  Preserved non-ASCII: ... (legitimate accented characters, if any)
  Saved to: ai-chat-report-7255-2026-04-22-fixed.csv
```

If the skill reports any `ERROR:` lines, stop and resolve before proceeding.

### 3. Verify the cleaned file

```bash
FIXED="$HOME/Digication Dropbox/Jeffrey Yan/Mac (2)/Downloads/ai-chat-report-7255-2026-04-22-fixed.csv"

# Row count using csv.reader — wc -l would mis-count because some quoted
# fields (student-pasted papers) span multiple lines.
python3 -c "
import csv
with open('$FIXED', encoding='utf-8', newline='') as f:
    rows = sum(1 for _ in csv.reader(f))
print('CSV rows including header:', rows)
"
# Expected: 252801 (252800 data rows + 1 header).

# U+FFFD count after fixing.
python3 -c "
with open('$FIXED', 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8', errors='replace')
print('U+FFFD count:', text.count('\uFFFD'))
"

# Curly-quote / dash / NBSP counts should all be 0.
python3 -c "
with open('$FIXED', 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8', errors='replace')
for label, ch in [
    ('U+2018', '\u2018'), ('U+2019', '\u2019'),
    ('U+201C', '\u201C'), ('U+201D', '\u201D'),
    ('U+2013', '\u2013'), ('U+2014', '\u2014'),
    ('U+2011', '\u2011'), ('U+200B', '\u200B'),
    ('U+00A0', '\u00A0'),
]:
    print(f'{label}:', text.count(ch))
"
```

**Pass thresholds:**
- Curly quotes / dashes / NBSP / ZWS (the entire second python block above): **all zero**.
- U+FFFD: **≤ 100**. The skill infers replacements from context for U+FFFD, but pathological cases (e.g., U+FFFD adjacent to non-ASCII) may slip through. If the count is ≤ 100, spot-check a handful and proceed. If > 100, stop and investigate — the skill's regexes may not match this file's encoding pattern, and we'd be importing bad data again.

### 4. Sanity-check the CSV structure

Make sure the sanitization did not accidentally break CSV quoting (the skill uses a CSV-aware reader/writer specifically to avoid this, but double-check):

```bash
# CSV-aware row count for BOTH files. Must match exactly.
python3 -c "
import csv, sys
for path in ['$FILE', '$FIXED']:
    with open(path, encoding='utf-8', errors='replace', newline='') as f:
        rows = sum(1 for _ in csv.reader(f))
    print(f'{path}: {rows} rows')
"

# Spot-check a row that had a U+FFFD in the original and eyeball the fixed
# version — is it plausibly what the student wrote?
python3 -c "
import csv
with open('$FIXED', encoding='utf-8', newline='') as f:
    r = csv.reader(f)
    headers = next(r)
    for i, row in enumerate(r):
        if i >= 20: break
        print(len(row), '|', row[8][:120])  # column 8 is 'Comment full text'
"
```

Expected: stable column count per row (all rows have the same number of fields as the header), and the first 20 `Comment full text` previews look like plain readable English.

## When done

Report:
- The fixed-file path (this is what phase 08 will upload).
- Character-fix counts reported by the skill.
- Row counts (original vs fixed) using **`csv.reader`** — should match exactly.
- U+FFFD residual count after fixing.
- Any rows where U+FFFD remained and how they were handled.
- Any surprises (e.g., skill reported `ERROR:`, or fixed file has a different column count from original).

**No commit for this phase** — it operates on a user file outside the repo. Nothing to commit.

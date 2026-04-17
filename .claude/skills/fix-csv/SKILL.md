---
name: fix-csv
description: Fix encoding issues (black diamond question marks) in AI chat report CSV files. Replaces smart quotes, em/en dashes, and other problematic Unicode characters with plain ASCII equivalents. Temporary skill until the root export problem is fixed.
metadata:
  allowed-tools: Read, Bash(python3:*), Bash(file:*), Bash(ls:*), Glob
  user-invocable: true
---

## Arguments
- File paths: one or more CSV file paths provided by the user (required)

## What this fixes
The AI chat report CSV export produces files with "smart" Unicode characters that display as black diamond question marks (U+FFFD) in Chat Explorer. This skill converts them to safe ASCII equivalents:

| Problem character | Replacement |
|---|---|
| Curly apostrophe ' ' (U+2018, U+2019) | Straight apostrophe ' |
| Curly double quotes " " (U+201C, U+201D) | Straight double quote " |
| Em dash — (U+2014) | Hyphen - |
| En dash – (U+2013) | Hyphen - |
| Non-breaking hyphen (U+2011) | Hyphen - |
| Zero-width space (U+200B) | Removed |
| Subscript digits (U+2080-U+2089) | Plain digits |
| Already-corrupted U+FFFD | Inferred from context (apostrophe or dash) |

Legitimate accented characters (Spanish, French, German, etc.) are preserved.

## Workflow

1. Validate that the provided file paths exist and are CSV files
2. Run the Python fix script on each file
3. Save corrected files with `-fixed` suffix in the same directory (originals are untouched)
4. Report what was fixed: character counts per file and any remaining non-ASCII characters
5. Remind the user to spot-check files that had U+FFFD (already-corrupted) characters, since those replacements are inferred from context

## CRITICAL: Must use CSV-aware parsing

**Do NOT do simple text find-and-replace on the raw file.** Replacing smart double quotes with straight double quotes breaks CSV field boundaries (straight `"` is the CSV delimiter). Always:
1. Parse the CSV into rows/fields first
2. Fix characters within each field value
3. Write back using a CSV writer (which handles quoting/escaping)

## Fix Script

Run this Python script, substituting the actual file paths provided by the user:

```python
import csv, re, os, io, unicodedata

def fix_csv_encoding(file_paths):
    # Unicode -> ASCII replacements
    REPLACEMENTS = {
        '\u2019': "'",   # right single quote (apostrophe)
        '\u2018': "'",   # left single quote
        '\u201C': '"',   # left double quote
        '\u201D': '"',   # right double quote
        '\u2014': '-',   # em dash
        '\u2013': '-',   # en dash
        '\u2011': '-',   # non-breaking hyphen
        '\u200B': '',    # zero-width space (remove)
        '\u00A0': ' ',   # non-breaking space -> regular space
    }
    
    # Subscript digits U+2080 through U+2089 -> 0-9
    for i in range(10):
        REPLACEMENTS[chr(0x2080 + i)] = str(i)
    
    def fix_field(text):
        """Fix encoding issues in a single CSV field value."""
        if not text:
            return text
        for old, new in REPLACEMENTS.items():
            text = text.replace(old, new)
        # Handle U+FFFD contextually
        if '\uFFFD' in text:
            text = re.sub(r'(\w)\uFFFD([a-z])', r"\1'\2", text)
            text = re.sub(r' \uFFFD ', ' - ', text)
            text = re.sub(r'(\d)\uFFFD(\d)', r'\1-\2', text)
            text = re.sub(r'\uFFFD', '-', text)
        return text
    
    for path in file_paths:
        if not os.path.exists(path):
            print(f"ERROR: File not found: {path}")
            continue
        
        fname = os.path.basename(path)
        
        # Read and decode
        with open(path, 'rb') as f:
            raw = f.read()
        text = raw.decode('utf-8', errors='replace')
        
        # Count issues before fixing
        total_fixes = 0
        for old in REPLACEMENTS:
            total_fixes += text.count(old)
        fffd_count = text.count('\uFFFD')
        total_fixes += fffd_count
        
        # Parse CSV, fix each field, write back (preserves quoting)
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        for i, row in enumerate(rows):
            for j, field in enumerate(row):
                rows[i][j] = fix_field(field)
        
        out_path = path.replace('.csv', '-fixed.csv')
        with open(out_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)
        
        # Verify output is valid CSV
        with open(out_path, 'r', encoding='utf-8') as f:
            verify = csv.reader(f)
            headers = next(verify)
            row_count = sum(1 for _ in verify)
            bad = sum(1 for r in csv.reader(open(out_path)) if len(r) != len(headers)) - (1 if True else 0)
        
        # Report remaining non-ASCII
        with open(out_path, 'r', encoding='utf-8') as f:
            out_text = f.read()
        remaining = set((c, unicodedata.name(c, '?')) for c in out_text if ord(c) > 127)
        
        print(f"\n{fname}:")
        print(f"  Characters fixed: {total_fixes} ({fffd_count} were already-corrupted)")
        print(f"  Output: {row_count} rows, {len(headers)} columns")
        if remaining:
            print(f"  Preserved non-ASCII: {', '.join(f'{c} ({n})' for c, n in sorted(remaining, key=lambda x: x[1]))}")
        print(f"  Saved to: {os.path.basename(out_path)}")

fix_csv_encoding(FILE_PATHS_HERE)
```

Replace `FILE_PATHS_HERE` with a Python list of the actual file paths the user provided.

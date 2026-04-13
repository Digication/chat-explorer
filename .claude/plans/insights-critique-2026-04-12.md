# Insights Critique — 2026-04-12

Round 2 critique after Phases 1–5 implementation. Covers UX gaps, missing interactivity, bugs, and unimplemented planned features.

---

## 1. Decimal Precision (Reflection Heatmap)

**Problem:** Numbers in the heatmap show excessive decimal places (many digits).
**Affected modes:** Classic, Sparkline, Small Multiples.
**Fix:** Cap all displayed values at 2 decimal places.

---

## 2. All-Student Summary Row (Classic Heatmap)

**Problem:** Sparkline mode has an all-student summary row, but Classic mode does not.
**Fix:** Add an aggregate/summary row to Classic mode matching the Sparkline pattern.

---

## 3. Clickable Student Names — Everywhere

**Problem:** Student names appear throughout the Insights page but are not clickable. Every student name should open the student panel.

**Affected locations:**
- Reflection Heatmap row labels (all modes: Classic, Sparkline, Small Multiples)
- Cell-click modal dialogs (when drilling into a cell in any heatmap mode, the student name in the modal should be clickable)
- Thread viewer header (student name at the top)
- Within the right-hand Faculty Panel itself — if a thread view or AI chat mentions a student, clicking should navigate to that student's profile *within the same panel*
- TORI Tag Frequency drill-down (see item 5)
- Student Engagement table (may already work from Phase 3, verify)

**Behavior:** Click student name → open Faculty Panel to Student tab (or navigate within panel if already open).

---

## 4. Notable Reflections — "View Full Conversation" Broken

**Problem:** In the student panel, under Notable Reflections, clicking "View full conversation" does nothing.
**Expected:** Should open the thread viewer and load that specific conversation.
**Priority:** Bug — this is a broken feature.

---

## 5. TORI Tag Frequency Drill-Down — Missing Student Names

**Problem:** When clicking a tag (e.g., "Pattern Recognition — 22 mentions"), the drill-down shows the mentions but does NOT show which student each mention belongs to.
**Fix:** Add student name to each mention row. Make the student name clickable (opens student panel). The "view full conversation" link should also work.

---

## 6. Student Panel — Student Selector / Navigation

**Problem:** No way to navigate to a different student from within the student panel. If no student was selected on page load, the panel is unclickable.
**Fix:** Add a search-as-you-type dropdown at the top of the Student tab that lets you search and switch to any student. Should work whether or not a student is already loaded.

---

## 7. TORI Network — Unusable in Current Form

**Problem:** Hover-only labels provide zero context. When hovering one node, you can see its name but not what it connects to. Moving to a connected node loses the first node's context. The visualization looks nice but gives no useful information.
**Fix:** Rethink the layout:
- Show node labels inside bounding boxes (mind-map style)
- Use bounding box dimensions for collision detection
- On hover/click, highlight the selected node AND all its connections (keep them visible)
- This is a significant redesign — current approach fundamentally doesn't work

---

## 8. Thread Viewer — Tag Highlighting

**Problem:** Chat Explorer already supports clicking tags at the top to highlight matching messages. The Thread Viewer (in the panel or modal) does not.
**Fix:**
- Add tag chips at the top of the Thread Viewer (same pattern as Chat Explorer)
- When opening a thread from a tag click in Student Engagement, pass the tag through so it's pre-selected/highlighted
- User can select/deselect additional tags, just like in Chat Explorer

---

## 9. Student Growth Over Time — No Interactivity

**Problem:** The Growth section cells are completely static. No way to drill into any cell.
**Fix:** Make cells clickable to show related conversations (similar to heatmap cell drill-down).

---

## 10. Co-Occurrence Patterns — No Interactivity

**Problem:** Co-occurrence pattern items are still not clickable (noted in earlier phases too).
**Fix:** Click a co-occurrence pair/triple → show conversations that contain those tags together.

---

## 11. Student Panel — Missing Growth Diagrams

**Problem:** The student panel may be missing some growth-related visualizations that were planned.
**Action:** Review the original plan for student panel TORI visualizations (Delta Heatmap, Sparklines, Slope Chart) and verify they're all present.

---

## 12. Chat Explorer — Default Student Selection

**Problem:** When no course is selected, no students appear. Previously agreed: show all students across all courses, paginated (first 50), with the first student auto-loaded.
**Fix:** When no course filter is active, list all students (paginated at 50), auto-select the first one.

---

## 13. Chat Explorer — Panel Context Mismatch (BUG)

**Problem:** When clicking a student in Chat Explorer, the student panel sometimes shows a different student's information. The panel context is not syncing with the selected student.
**Fix:** When the selected student changes in Chat Explorer, update the Faculty Panel's student context to match.

---

## 14. AI Chat Scope Model — Incomplete Implementation

**Problem:** The scope toggle only shows "this course" vs "all courses." The plan called for a full matrix of scope permutations. This was planned but NOT implemented across Phase 2, 3, and now Phase 5.

**Required scope options (from the original plan matrix):**
- This student, this assignment, this course
- This student, all assignments, this course
- All students, this assignment, this course
- All students, all assignments, this course
- All students, all assignments, all courses (cross-course)

The scope should auto-detect based on current context (which student/assignment/course is selected) and allow manual override via the dropdown.

**Action:** Look up the original scope matrix from the plan and implement it fully this time.

---

## 15. AI Chat Scope Change Bug

**Problem:** When changing scope (e.g., "this course" → "all courses"):
1. The divider appears in the chat
2. But the next AI response uses the OLD context
3. The divider gets pushed BELOW the new AI response instead of staying in chronological position

**Root cause likely:** Scope dividers are UI-only state, not tied to message ordering. The scope change doesn't actually update the backend context for the next message.
**Fix:** Scope changes must update the actual context sent to the AI. Dividers must render in chronological order relative to messages.

---

## 16. Insights Page AI Chat — Wrong Context

**Problem:** When on the Insights page, the AI chat should be aware of the analytics context (Reflection Heatmap data, TORI frequencies, engagement data, etc.), not just course/chat context.
**Fix:** When AI Chat is opened from the Insights page, the context should include the analytics data visible on the page — users expect to ask questions about the heatmap, TORI network, engagement metrics, etc.

---

## 17. Panel Persistence + Context Change Choice

**Problem:** The panel is persistent across pages (good), but when the page context changes (e.g., navigating from one page to another, or switching courses), the panel doesn't acknowledge the change.
**Fix:** When context changes:
- Panel stays open (persistent)
- Show a prompt/indicator that context has changed
- Give the user a choice: "Context changed — update panel to match?" or keep the current panel content
- Default behavior: update the context, but let the user opt out

---

## Summary of Issue Types

| Type | Items |
|------|-------|
| Bug fixes | #4 (view full conversation broken), #13 (panel context mismatch), #15 (scope change bug) |
| Missing interactivity | #3 (clickable names), #5 (tag drill-down names), #8 (thread tag highlighting), #9 (growth cells), #10 (co-occurrence) |
| Unimplemented planned features | #14 (scope matrix), #12 (default student selection) |
| UX improvements | #1 (decimals), #2 (summary row), #6 (student selector), #7 (TORI network redesign), #11 (growth diagrams), #16 (insights AI context), #17 (context change choice) |

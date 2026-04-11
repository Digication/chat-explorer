# Plan 4 — UX Polish & Interactivity Pass

**Status:** ✅ Complete (merged to main 2026-04-10, commit `52d7dc2`)
**Priority:** NEXT — execution order is Plan 1 -> 3 -> **4** -> 2 -> 5
**Depends on:** Plan 3 (merged)

## Why this plan exists

The app works functionally but feels rough in a demo. Tooltips are slow, graphs overlap, clicking things leads to "No evidence found," and visual styling is inconsistent. This plan is a "make the demo feel good" pass — individually small items that collectively transform the experience from prototype to presentable product.

## Theme A — Header & Navigation Polish

1. **Hide dropdown arrow on school name for non-admins** — if the user can only see one institution, the dropdown affordance is misleading.
2. **Replace noisy down arrows under courses/assignments** with hover-only underlines or subtle chevrons. Current arrows clutter the header.

## Theme C — Insights Page Interactivity

1. **Replace MUI's slow hover tooltips with instant CSS/custom hovers** — the default MUI tooltip has a noticeable delay that makes the heatmap feel sluggish.
2. **Stop Insights from shrinking too aggressively** when the AI chat panel opens on wide screens. The content area should maintain a readable width.
3. **Heatmap sparkline dot size** should encode "how common is this TORI category across all students" — helps spot what makes one student different from the group.

## Theme D — TORI Tag Frequency Module

1. **Paginate or show top 10** when there are many mentions — currently dumps everything.
2. **Make evidence list scrollable/paginated** — long lists push the page layout.

## Theme E — TORI Network Graph

1. **Fix node and label overlap** — currently illegible when many nodes are present.
2. **Add collision avoidance** — force-directed layout needs collision padding so nodes don't pile on top of each other.
3. **Make it interactive** like heatmap and TORI frequency — click nodes/edges to see evidence.

## Theme F — Student Engagement

1. **Clicking a student should open the chat panel on the side**, not show "No evidence found." The chat panel already exists — just wire it up.
2. **Add toggle to show/hide reflection depth** — this is sensitive in classroom settings where instructors may not want students compared on reflective ability.

## Theme G — Chat Panel Visual Polish

1. **Student messages:** drop the blue background, use white with no box (cleaner look).
2. **AI messages:** fix border inconsistency — currently has 3 borders but no left border. Should be 4 or 0.

## Theme H — Chat Explorer Page

1. **Auto-load the first student** instead of requiring a click on the carousel.
2. **Max line width 12-15 words** — don't stretch messages full-width on large screens.
3. **Analyze panel open by default** — this is the primary action users want.
4. Apply same visual critiques as Insights (reflection depth, evidence, interactivity).

## Theme I — AI Chat Scope Rethink (BIG)

1. **Replace the 3-toggle scope system** ("selection / course / all data") with a 2x2 matrix model:
   - `{this student / all students}` x `{this assignment / all assignments}`
   - Implemented as two side-by-side toggles.
2. **Record mode changes in the chat log** so you can see what context each question was asked with.
3. **Auto-load the latest chat history item on open** (not a fresh chat), matching the Campus UI pattern from `campus-web`.

## Theme J — Bottom Bar & Carousel

1. **Reflection depth badges are too similar to TORI pills** — render differently and make optional.
2. **Fix confusing click behavior in student roster** — clicking silently adds to multi-select context instead of switching the viewed student. Need clear distinction between "view this student" and "add to chat context."
3. **Carousel spacing/sizing** should match Digication Campus UI reference (`campus-web` repo).
4. **Make the entire "Analyze" box clickable**, not just the icon (bigger hit target).
5. **Same for the "Students" button** on the bottom left.

## Implementation approach

These themes are mostly independent. Group by area (header, insights components, chat panel, explorer page, bottom bar) and tackle in phases. Each theme can be its own commit. Prioritize the high-visibility items (Theme E network graph, Theme I scope rethink) alongside the quick wins (Themes A, G).

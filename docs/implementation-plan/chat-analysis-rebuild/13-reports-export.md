# Phase 13 — Reports & Export

You are building the report generation and data export system for the **Chat Analysis** app.

**Context:** Phases 01–12 built the complete application: CSV upload with TORI extraction, consent management, analytics engine with caching, GraphQL API, React frontend with Insights page, Chat Explorer with bottom bar/carousel/panels, and AI chat integration. All analytics are computed and cached server-side.

## Goal

Add on-demand report generation (PDF) and raw data export (CSV) so educators can share findings outside the app. Four report types cover different analysis needs. All exports respect student consent — excluded students never appear in any generated output.

## Overview

- Server-side PDF generation using `@react-pdf/renderer`
- CSV export using `json2csv` for raw data download
- Four report types: Course Analytics, Student Profile, Cross-Course Comparison, Raw Data Export
- Export dialog UI with format picker (PDF/CSV) and scope selector
- Report preview before download
- All generated outputs respect consent exclusions
- Reports are generated on-demand, not pre-computed or cached

## Steps

### 1. Create the CSV export service

**Files to create:** `src/server/services/export-csv.ts`

This service generates CSV strings from analytics data. It queries the database directly and applies consent filtering before building the output.

```typescript
import { Parser } from "json2csv";
import { AppDataSource } from "../data-source.js";
import { Comment } from "../entities/Comment.js";
import { getConsentFilteredStudentIds } from "./consent.js";

interface CsvExportOptions {
  courseId: string;
  assignmentId?: string;
  institutionId: string;
}

/**
 * Export all comments for a course/assignment as CSV.
 * Columns: thread_id, thread_name, comment_id, role, author_name,
 *          text, tori_tags, word_count, timestamp
 *
 * Students excluded by consent are omitted entirely.
 */
export async function exportRawDataCsv(options: CsvExportOptions): Promise<string> {
  // 1. Get list of excluded student IDs from consent service
  // 2. Query comments with relations (student, toriTags, thread)
  // 3. Filter out excluded students
  // 4. Map to flat rows with TORI tags joined as comma-separated string
  // 5. Use json2csv Parser to produce CSV string
  // Return the CSV string
}

/**
 * Export TORI tag frequency summary as CSV.
 * Columns: tag, count, percent_share, student_coverage
 */
export async function exportToriSummaryCsv(
  courseId: string,
  institutionId: string
): Promise<string> {
  // Query cached analytics or compute on the fly
  // Return CSV string
}
```

### 2. Create the PDF export service

**Files to create:** `src/server/services/export-pdf.ts`

This service generates PDF reports using `@react-pdf/renderer`. Each report type has its own layout function. PDFs include a header with institution name, generation date, and scope description.

```typescript
import ReactPDF from "@react-pdf/renderer";

interface ReportHeader {
  institutionName: string;
  generatedAt: Date;
  scope: string; // e.g. "CS 101 — Fall 2025" or "All Courses"
  reportType: string;
}

/**
 * Course Analytics Report
 * - Overview stats (threads, participants, comment counts)
 * - TORI tag distribution bar chart (rendered as styled rectangles)
 * - Depth band analysis (surface/developing/deep percentages)
 * - Top 10 instructional insights
 * - Top co-occurrence pairs
 */
export async function generateCourseAnalyticsReport(
  courseId: string,
  institutionId: string
): Promise<Buffer> {
  // 1. Fetch overview stats from analytics service
  // 2. Fetch TORI analytics
  // 3. Fetch depth band data
  // 4. Fetch instructional insights
  // 5. Apply consent filtering
  // 6. Build React PDF document with styled components
  // 7. Render to buffer with ReactPDF.renderToBuffer()
}

/**
 * Student Profile Report
 * - Per-student TORI tag breakdown
 * - Engagement score and depth band
 * - Up to 3 exemplar comments per student
 * - Masked names by default (full names only if PII toggle is on)
 */
export async function generateStudentProfileReport(
  courseId: string,
  institutionId: string,
  showPII: boolean
): Promise<Buffer> {
  // Similar pattern: fetch data, filter consent, build PDF
}

/**
 * Cross-Course Comparison Report
 * - Side-by-side TORI distributions across 2–5 courses
 * - Comparative depth band analysis
 * - Shared vs. unique patterns
 */
export async function generateCrossCourseReport(
  courseIds: string[],
  institutionId: string
): Promise<Buffer> {
  // Fetch analytics for each course, build comparison tables
}
```

### 3. Add export GraphQL resolvers

**Files to modify:** `src/server/resolvers/ExportResolver.ts`

Add mutations for generating exports:

```typescript
@Mutation(() => String, { description: "Generate a PDF report and return a temporary download URL" })
async generateReport(
  @Arg("reportType") reportType: string,  // COURSE_ANALYTICS | STUDENT_PROFILE | CROSS_COURSE
  @Arg("courseId", { nullable: true }) courseId: string,
  @Arg("courseIds", () => [String], { nullable: true }) courseIds: string[],
  @Arg("showPII", { defaultValue: false }) showPII: boolean,
  @Ctx() ctx: GraphQLContext
): Promise<string> {
  // 1. Validate user has access to the requested courses
  // 2. Call the appropriate PDF generation function
  // 3. Write the buffer to a temp file or return as base64 data URL
  // 4. Return the download URL/path
}

@Mutation(() => String, { description: "Generate a CSV export and return download URL" })
async exportCsv(
  @Arg("exportType") exportType: string,  // RAW_DATA | TORI_SUMMARY
  @Arg("courseId") courseId: string,
  @Arg("assignmentId", { nullable: true }) assignmentId: string,
  @Ctx() ctx: GraphQLContext
): Promise<string> {
  // Similar pattern
}
```

### 4. Create the ExportDialog component

**Files to create:** `src/components/export/ExportDialog.tsx`

A modal dialog that lets the user configure and trigger an export:

- **Format picker**: Radio buttons for PDF or CSV
- **Report type selector**: Dropdown showing available report types based on format
  - PDF: Course Analytics, Student Profile, Cross-Course Comparison
  - CSV: Raw Data, TORI Summary
- **Scope selector**: Which course(s) or assignment to export
  - Single course dropdown (for most reports)
  - Multi-course checkboxes (for Cross-Course Comparison)
  - Optional assignment filter (for Raw Data CSV)
- **PII toggle**: Checkbox for "Include full student names" (off by default)
- **Generate button**: Triggers the GraphQL mutation, shows loading spinner
- **Download link**: Appears after generation completes

Use MUI `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `RadioGroup`, `Select`, `Checkbox`, `Button`, `LinearProgress`.

### 5. Create the ReportPreview component

**Files to create:** `src/components/export/ReportPreview.tsx`

A lightweight preview of what the report will contain before the user commits to generating it:

- Shows a summary of what will be included (number of students, comments, date range)
- Shows a warning if any students are consent-excluded
- Shows estimated report size (small/medium/large based on data volume)
- Renders inside the ExportDialog below the configuration options

### 6. Create the Reports page

**Files to create:** `src/pages/ReportsPage.tsx`

A dedicated page accessible from the sidebar that:

- Shows a list of available report types with descriptions
- Each report type has a "Generate" button that opens the ExportDialog pre-configured for that type
- Shows recent exports (if any were generated in the current session — stored in React state, not persisted)
- Includes a "Quick Export" section with one-click buttons for common exports (e.g. "Export all data as CSV")

### 7. Wire ReportsPage into the app

**Files to modify:** `src/App.tsx` — Add the `/reports` route pointing to `ReportsPage`.

**Files to modify:** `src/components/layout/Sidebar.tsx` — Add a "Reports" icon/link in the sidebar navigation.

## Files to Create

| File | Purpose |
|------|---------|
| `src/server/services/export-pdf.ts` | PDF report data generation (CourseReport JSON) |
| `src/server/services/export-csv.ts` | CSV data export with json2csv |
| `src/pages/ReportsPage.tsx` | Reports & Export page |
| `src/components/export/ExportDialog.tsx` | Export configuration modal |
| `src/components/export/ReportPreview.tsx` | Pre-generation preview of report contents |
| `src/components/export/types.ts` | Shared `CourseReport` interface for client |
| `src/components/export/CourseReportPdf.tsx` | React PDF document component (@react-pdf/renderer) |
| `src/components/export/renderPdfBlob.tsx` | Async helper: `pdf().toBlob()` for client-side PDF rendering |

## Files to Modify

| File | Change |
|------|--------|
| `src/server/resolvers/ExportResolver.ts` | Add generateReport and exportCsv mutations |
| `src/App.tsx` | Add /reports route |
| `src/components/layout/Sidebar.tsx` | Add Reports navigation link |

## Test Files

| File | Purpose |
|------|---------|
| `src/components/export/__tests__/CourseReportPdf.test.tsx` | Component instantiation (4 tests) |
| `src/components/export/__tests__/renderPdfBlob.test.tsx` | PDF blob output validation (2 tests) |
| `src/components/export/__tests__/ExportDialog.test.tsx` | Dialog UI + CSV/PDF mutation flows (6 tests) |
| `src/server/resolvers/export.test.ts` | Resolver auth, validation, response shapes (8 tests) |
| `src/server/services/export-pdf.test.ts` | Service output shape, rounding, limits (9 tests) |
| `e2e/export.spec.ts` | Page structure, dialog interactions, downloads (10 tests) |

## Implementation Status

### Completed

- [x] **Step 1** — CSV export service (`export-csv.ts`) with consent filtering
- [x] **Step 2** — PDF report data service (`export-pdf.ts`) returning CourseReport JSON
- [x] **Step 3** — Export GraphQL resolver (`export.ts`) with auth checks
- [x] **Step 4** — ExportDialog component with format picker, course selector, preview
- [x] **Step 5** — ReportPreview component showing data summary before generation
- [x] **Step 6** — ReportsPage with 3 report type cards (Course Analytics PDF, Raw Data CSV, TORI Summary CSV)
- [x] **Step 7** — Wired into App.tsx (`/reports` route) and Sidebar navigation
- [x] **Client-side PDF rendering** — `CourseReportPdf.tsx` renders structured report using `@react-pdf/renderer` (Document/Page/View/Text), `renderPdfBlob.tsx` provides `pdf().toBlob()` helper, ExportDialog decodes server JSON and renders to PDF blob in-browser
- [x] **Full test coverage** — 39 new tests across 6 test files (unit + e2e)

### Architecture

PDF generation uses a **client-side rendering** approach:
1. Server returns `CourseReport` JSON as a base64 data URL (lightweight, fast)
2. Client decodes the JSON and passes it to `@react-pdf/renderer`
3. `pdf(<CourseReportPdf />).toBlob()` renders a real PDF in the browser
4. The blob is converted to an object URL and triggers a browser download

This avoids server-side PDF rendering dependencies (no Puppeteer, no headless Chrome) while producing styled, multi-section reports.

### PDF Report Sections

The generated PDF includes:
1. **Header** — course name, generation date, horizontal rule
2. **Overview stats** — 4 boxes: comments, threads, participants, TORI tags
3. **TORI Frequency table** — tag name, domain, count, percent with alternating row backgrounds
4. **Reflection Depth Distribution** — Hatton & Smith depth bands with counts and percentages
5. **Top Tag Co-occurrences** — numbered list of tag pairs

## Verification

```bash
docker compose up -d --build
docker compose exec app pnpm typecheck
docker compose exec app pnpm test
docker compose run --rm e2e
```

Expected: TypeScript compiles. All 151 unit tests pass (27 files). The Reports page renders in the browser. The ExportDialog opens with format and scope options. Generating a CSV export produces a valid CSV file. Generating a PDF export produces a downloadable PDF (verified: 11KB, `%PDF-` header, `application/pdf` MIME type) with correct header, data tables, and no consent-excluded students.

## When done

Report: files created/modified (with summary per file), verification results, and any issues encountered.

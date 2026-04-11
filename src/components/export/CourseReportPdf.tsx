import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { CourseReport } from "./types";

/* ── Digication-inspired design tokens ───────────────────────── */
const PRIMARY = "#1976d2";
const TEXT_COLOR = "#333333";
const MUTED = "#666666";
const BG_LIGHT = "#f5f7fa";
const BG_ALT_ROW = "#f9fafb";
const BORDER = "#e0e0e0";

/* ── Depth-band human-readable labels ────────────────────────── */
const DEPTH_LABELS: Record<string, string> = {
  DESCRIPTIVE_WRITING: "Descriptive Writing",
  DESCRIPTIVE_REFLECTION: "Descriptive Reflection",
  DIALOGIC_REFLECTION: "Dialogic Reflection",
  CRITICAL_REFLECTION: "Critical Reflection",
};

/* ── Stylesheet ──────────────────────────────────────────────── */
const s = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: TEXT_COLOR,
  },

  /* Header */
  title: { fontSize: 18, fontWeight: "bold", color: PRIMARY },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 4 },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginTop: 12,
    marginBottom: 12,
  },

  /* Section headers */
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 16,
  },

  /* Overview stat boxes */
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    padding: 8,
    backgroundColor: BG_LIGHT,
    marginHorizontal: 4,
    borderRadius: 2,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "bold", color: PRIMARY },
  statLabel: { fontSize: 8, color: MUTED, marginTop: 2 },

  /* Table */
  tableHeader: {
    flexDirection: "row",
    backgroundColor: PRIMARY,
    padding: 6,
  },
  tableHeaderText: { color: "#ffffff", fontSize: 9, fontWeight: "bold" },
  tableRow: {
    flexDirection: "row",
    padding: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tableRowAlt: { backgroundColor: BG_ALT_ROW },
  tableCell: { fontSize: 9 },

  /* Column widths for TORI frequency table */
  colTag: { width: "40%" },
  colDomain: { width: "25%" },
  colCount: { width: "15%", textAlign: "right" },
  colPercent: { width: "20%", textAlign: "right" },

  /* Category distribution */
  catRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  catLabel: { fontSize: 10 },
  catValue: { fontSize: 10, fontWeight: "bold" },

  /* Co-occurrences */
  coRow: { flexDirection: "row", paddingVertical: 3 },
  coIndex: { width: 20, fontSize: 9, color: MUTED },
  coTags: { flex: 1, fontSize: 9 },
  coCount: { width: 40, fontSize: 9, textAlign: "right" },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
  },
});

/* ── Component ───────────────────────────────────────────────── */

interface Props {
  report: CourseReport;
}

export default function CourseReportPdf({ report }: Props) {
  const generatedDate = new Date(report.generatedAt).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  const totalDepth = Object.values(report.categoryDistribution).reduce(
    (sum, v) => sum + v,
    0
  );

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header ───────────────────────────────────────── */}
        <Text style={s.title}>{report.courseName}</Text>
        <Text style={s.subtitle}>
          Course Analytics Report — Generated {generatedDate}
        </Text>
        <View style={s.hr} />

        {/* ── Overview stats ───────────────────────────────── */}
        <Text style={s.sectionTitle}>Overview</Text>
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statValue}>{report.overview.totalComments}</Text>
            <Text style={s.statLabel}>Comments</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{report.overview.threadCount}</Text>
            <Text style={s.statLabel}>Threads</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>
              {report.overview.participantCount}
            </Text>
            <Text style={s.statLabel}>Participants</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statValue}>{report.overview.toriTagCount}</Text>
            <Text style={s.statLabel}>TORI Tags</Text>
          </View>
        </View>

        {/* ── TORI Frequency table ─────────────────────────── */}
        {report.toriFrequencies.length > 0 && (
          <>
            <Text style={s.sectionTitle}>TORI Tag Frequencies</Text>
            {/* Header row */}
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, s.colTag]}>Tag</Text>
              <Text style={[s.tableHeaderText, s.colDomain]}>Domain</Text>
              <Text style={[s.tableHeaderText, s.colCount]}>Count</Text>
              <Text style={[s.tableHeaderText, s.colPercent]}>%</Text>
            </View>
            {/* Data rows */}
            {report.toriFrequencies.map((f, i) => (
              <View
                key={`${f.tagName}-${i}`}
                style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
                wrap={false}
              >
                <Text style={[s.tableCell, s.colTag]}>{f.tagName}</Text>
                <Text style={[s.tableCell, s.colDomain]}>{f.domain}</Text>
                <Text style={[s.tableCell, s.colCount]}>{f.count}</Text>
                <Text style={[s.tableCell, s.colPercent]}>
                  {f.percent.toFixed(1)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* ── Category Distribution ────────────────────────── */}
        <Text style={s.sectionTitle}>Reflection Depth Distribution</Text>
        {(
          Object.entries(report.categoryDistribution) as [string, number][]
        ).map(([key, value], i) => (
          <View
            key={key}
            style={[s.catRow, i % 2 === 1 ? { backgroundColor: BG_ALT_ROW } : {}]}
          >
            <Text style={s.catLabel}>
              {DEPTH_LABELS[key] ?? key}
            </Text>
            <Text style={s.catValue}>
              {value}
              {totalDepth > 0
                ? ` (${((value / totalDepth) * 100).toFixed(1)}%)`
                : ""}
            </Text>
          </View>
        ))}

        {/* ── Top Co-occurrences ────────────────────────────── */}
        {report.topCoOccurrences.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Top Tag Co-occurrences</Text>
            {report.topCoOccurrences.map((co, i) => (
              <View key={i} style={s.coRow}>
                <Text style={s.coIndex}>{i + 1}.</Text>
                <Text style={s.coTags}>{co.tags.join(" + ")}</Text>
                <Text style={s.coCount}>{co.count}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── Footer ───────────────────────────────────────── */}
        <Text style={s.footer}>
          Chat Explorer — Digication • {generatedDate}
        </Text>
      </Page>
    </Document>
  );
}

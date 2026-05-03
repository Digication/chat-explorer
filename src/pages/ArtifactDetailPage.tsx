/**
 * Detail view for a single artifact. Lists its parsed sections and,
 * for each section, the evidence moments the analyzer produced.
 *
 * While status = PROCESSING the page polls so the content appears as
 * soon as the background analyzer finishes.
 */
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { GET_ARTIFACT, DELETE_ARTIFACT } from "@/lib/queries/artifact";
import { API_BASE } from "@/lib/api-base";

interface OutcomeAlignment {
  outcomeCode: string;
  outcomeName: string;
  strengthLevel: string;
  rationale: string | null;
}

interface EvidenceMoment {
  id: string;
  narrative: string;
  sourceText: string;
  processedAt: string;
  outcomeAlignments: OutcomeAlignment[];
}

interface Section {
  id: string;
  sequenceOrder: number;
  title: string | null;
  content: string;
  type: string;
  wordCount: number;
  evidenceMoments: EvidenceMoment[];
}

interface ArtifactDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  hasStoredFile: boolean;
  uploadedAt: string;
  errorMessage: string | null;
  student: { id: string; displayName: string } | null;
  course: { id: string; name: string } | null;
  assignment: { id: string; name: string } | null;
  sections: Section[];
}

/**
 * Tiny coloured chip for the outcome strength — matches the evidence
 * summary tiles elsewhere in the app.
 */
function StrengthChip({ level }: { level: string }) {
  const color: "default" | "success" | "warning" | "error" | "info" = (() => {
    switch (level) {
      case "EXEMPLARY":
        return "success";
      case "DEMONSTRATING":
        return "info";
      case "DEVELOPING":
        return "warning";
      case "EMERGING":
        return "default";
      default:
        return "default";
    }
  })();
  return <Chip size="small" color={color} label={level.toLowerCase()} />;
}

export default function ArtifactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, loading, error, startPolling, stopPolling } = useQuery<{
    artifact: ArtifactDetail | null;
  }>(GET_ARTIFACT, {
    variables: { id },
    skip: !id,
  });

  // Poll while analysis is still running.
  const status = data?.artifact?.status;
  useEffect(() => {
    if (status === "PROCESSING") startPolling(3000);
    else stopPolling();
    return () => stopPolling();
  }, [status, startPolling, stopPolling]);

  const [deleteArtifact, { loading: deleting }] = useMutation(DELETE_ARTIFACT, {
    onCompleted: () => navigate("/artifacts"),
  });

  if (loading && !data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load artifact: {error.message}
      </Alert>
    );
  }

  const artifact = data?.artifact;
  if (!artifact) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Artifact not found or you don't have access to it.
      </Alert>
    );
  }

  const handleDownload = () => {
    window.location.href = `${API_BASE}/api/artifacts/${artifact.id}/download`;
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete "${artifact.title}"? This hides it from lists but can be restored by an admin.`
      )
    ) {
      return;
    }
    void deleteArtifact({ variables: { id: artifact.id } });
  };

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", py: 4, px: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <IconButton size="small" onClick={() => navigate("/artifacts")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={500} sx={{ flex: 1 }}>
          {artifact.title}
        </Typography>
        {artifact.hasStoredFile && (
          <Tooltip title="Download the original file">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={handleDownload}
            >
              Download
            </Button>
          </Tooltip>
        )}
        <Tooltip title="Delete this artifact">
          <span>
            <IconButton
              size="small"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete artifact"
            >
              <DeleteOutlineIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Metadata line */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" gap={3} flexWrap="wrap">
          <MetaField
            label="Student"
            value={artifact.student?.displayName ?? "—"}
          />
          <MetaField label="Course" value={artifact.course?.name ?? "—"} />
          <MetaField
            label="Assignment"
            value={artifact.assignment?.name ?? "—"}
          />
          <MetaField label="Type" value={artifact.type.toLowerCase()} />
          <MetaField label="Status" value={artifact.status.toLowerCase()} />
          <MetaField
            label="Uploaded"
            value={new Date(artifact.uploadedAt).toLocaleDateString()}
          />
        </Stack>
      </Paper>

      {/* Status-specific banners */}
      {artifact.status === "PROCESSING" && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<CircularProgress size={16} />}>
          Analyzing sections… this page will update automatically.
        </Alert>
      )}
      {artifact.status === "FAILED" && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Analysis failed: {artifact.errorMessage ?? "unknown error"}
        </Alert>
      )}

      {/* Sections */}
      <Typography variant="h6" sx={{ mb: 1 }}>
        Sections ({artifact.sections.length})
      </Typography>

      {artifact.sections.length === 0 ? (
        <Alert severity="info">No sections were extracted from this artifact.</Alert>
      ) : (
        <Stack gap={2}>
          {artifact.sections.map((section) => (
            <Paper key={section.id} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={500}>
                {section.title || `Section ${section.sequenceOrder + 1}`}
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  {section.wordCount} words · {section.type.toLowerCase()}
                </Typography>
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  whiteSpace: "pre-wrap",
                  color: "text.secondary",
                  mt: 1,
                  maxHeight: 220,
                  overflow: "auto",
                  borderLeft: "3px solid",
                  borderColor: "divider",
                  pl: 2,
                }}
              >
                {section.content}
              </Typography>

              {section.evidenceMoments.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" fontWeight={500} gutterBottom>
                    Evidence
                  </Typography>
                  <Stack gap={1.5}>
                    {section.evidenceMoments.map((moment) => (
                      <Box
                        key={moment.id}
                        sx={{
                          bgcolor: "action.hover",
                          p: 1.5,
                          borderRadius: 1,
                        }}
                      >
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          {moment.narrative}
                        </Typography>
                        {moment.outcomeAlignments.length > 0 && (
                          <Stack direction="row" gap={1} flexWrap="wrap">
                            {moment.outcomeAlignments.map((a, i) => (
                              <Tooltip
                                key={`${moment.id}-${i}`}
                                title={a.rationale ?? ""}
                                arrow
                              >
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={
                                    <Stack
                                      direction="row"
                                      gap={0.5}
                                      alignItems="center"
                                    >
                                      <span>{a.outcomeCode}</span>
                                      <StrengthChip level={a.strengthLevel} />
                                    </Stack>
                                  }
                                />
                              </Tooltip>
                            ))}
                          </Stack>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

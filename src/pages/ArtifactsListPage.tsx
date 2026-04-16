/**
 * Artifacts list page for faculty & students. Shows every artifact the
 * caller is authorized to see (the GraphQL resolver handles role-scoped
 * filtering). Clicking a row opens the detail page.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { GET_ARTIFACTS } from "@/lib/queries/artifact";
import UploadArtifactDialog from "@/components/artifacts/UploadArtifactDialog";

/** Shape of a row returned by GET_ARTIFACTS. */
interface ArtifactRow {
  id: string;
  title: string;
  type: string;
  status: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  hasStoredFile: boolean;
  sectionCount: number;
  uploadedAt: string;
  errorMessage: string | null;
  student: { id: string; name: string } | null;
  course: { id: string; name: string } | null;
  assignment: { id: string; name: string } | null;
}

/** Map artifact status to a small coloured chip. */
function StatusChip({ status }: { status: string }) {
  const color: "default" | "success" | "warning" | "error" | "info" = (() => {
    switch (status) {
      case "ANALYZED":
        return "success";
      case "PROCESSING":
        return "info";
      case "UPLOADED":
        return "default";
      case "FAILED":
        return "error";
      default:
        return "default";
    }
  })();
  return <Chip size="small" color={color} label={status.toLowerCase()} />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ArtifactsListPage() {
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);

  // Poll while any artifact is PROCESSING so the status badge updates
  // without the user having to refresh.
  const { data, loading, error, refetch, startPolling, stopPolling } = useQuery<{
    artifacts: ArtifactRow[];
  }>(GET_ARTIFACTS);

  const rows = data?.artifacts ?? [];
  const hasProcessing = useMemo(
    () => rows.some((r) => r.status === "PROCESSING"),
    [rows]
  );

  useEffect(() => {
    if (hasProcessing) startPolling(3000);
    else stopPolling();
    return () => stopPolling();
  }, [hasProcessing, startPolling, stopPolling]);

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", py: 4, px: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={500}>
            Artifacts
          </Typography>
          <Typography color="text.secondary">
            Papers, presentations, and wrapped conversations.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setUploadOpen(true)}
        >
          Upload
        </Button>
      </Box>

      {loading && !data && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ my: 2 }}>
          Failed to load artifacts: {error.message}
        </Alert>
      )}

      {!loading && !error && rows.length === 0 && (
        <Alert severity="info">
          No artifacts yet. Click <strong>Upload</strong> to add one.
        </Alert>
      )}

      {rows.length > 0 && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Student</TableCell>
                <TableCell>Course</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Sections</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  onClick={() => navigate(`/artifacts/${row.id}`)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {row.title}
                    </Typography>
                    {row.assignment && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {row.assignment.name}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{row.student?.name ?? "—"}</TableCell>
                  <TableCell>{row.course?.name ?? "—"}</TableCell>
                  <TableCell>{row.type.toLowerCase()}</TableCell>
                  <TableCell>{row.sectionCount}</TableCell>
                  <TableCell>{formatSize(row.fileSizeBytes)}</TableCell>
                  <TableCell>{formatDate(row.uploadedAt)}</TableCell>
                  <TableCell>
                    <StatusChip status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <UploadArtifactDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          void refetch();
        }}
      />
    </Box>
  );
}

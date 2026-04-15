import { useState, useCallback, useRef } from "react";
import { useTrackEvent } from "@/lib/hooks/useTrackEvent";
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableRow,
  TableCell,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { API_BASE } from "@/lib/api-base";

// Shape of the preview response from the server
interface PreviewResult {
  totalRows: number;
  newComments: number;
  duplicateComments: number;
  newThreads: number;
  newStudents: number;
  newAssignments: number;
  newCourses: number;
  detectedInstitutionId: string | null;
  detectedInstitutionName: string | null;
}

// Shape of the commit response (preview + a few extra fields)
interface CommitResult extends PreviewResult {
  uploadLogId: string;
  toriTagsExtracted: number;
  courseAccessCreated: boolean;
  updatedComments: number;
}

type Step = "pick" | "previewing" | "preview" | "committing" | "done";

export default function CsvUploadCard() {
  const trackEvent = useTrackEvent();
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Called when a file is selected (via click or drag-and-drop)
  const handleFile = useCallback(async (selectedFile: File) => {
    setError(null);

    if (!selectedFile.name.endsWith(".csv")) {
      setError("Please select a .csv file.");
      return;
    }

    setFile(selectedFile);
    setStep("previewing");

    try {
      // Send the file to the server for a dry-run preview
      const form = new FormData();
      form.append("file", selectedFile);

      const res = await fetch(`${API_BASE}/api/upload/preview`, {
        method: "POST",
        body: form,
        credentials: "include", // send auth cookie
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data: PreviewResult = await res.json();
      setPreview(data);
      setStep("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setStep("pick");
    }
  }, []);

  // Called when the user confirms the upload
  const handleCommit = useCallback(async () => {
    if (!file || !preview) return;
    setStep("committing");
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      // Include the detected institution ID so the server knows where to store the data
      if (preview.detectedInstitutionId) {
        form.append("institutionId", preview.detectedInstitutionId);
      }

      // When replace mode is on, existing comments will be updated with
      // the new (cleaner) text instead of being skipped
      if (replaceMode) {
        form.append("replaceMode", "true");
      }

      const res = await fetch(`${API_BASE}/api/upload/commit`, {
        method: "POST",
        body: form,
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data: CommitResult = await res.json();
      setCommitResult(data);
      trackEvent("UPLOAD", "complete", { rowCount: data.newComments ?? 0 });
      setStep("done");
    } catch (err: unknown) {
      trackEvent("UPLOAD", "fail", { error: err instanceof Error ? err.message : "Upload failed" });
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("preview"); // let them retry
    }
  }, [file, preview]);

  // Reset everything so the user can upload another file
  const handleReset = () => {
    setStep("pick");
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setError(null);
    setReplaceMode(false);
  };

  // Drag-and-drop event handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  };

  return (
    <Paper
      elevation={0}
      sx={{ p: 4, border: "1px solid", borderColor: "divider" }}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step 1: Pick a file */}
      {step === "pick" && (
        <Box
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          sx={{
            border: "2px dashed",
            borderColor: dragOver ? "primary.main" : "divider",
            borderRadius: 1,
            p: 6,
            textAlign: "center",
            cursor: "pointer",
            bgcolor: dragOver ? "action.hover" : "transparent",
            transition: "all 150ms ease",
            "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
          }}
        >
          <CloudUploadOutlinedIcon
            sx={{ fontSize: 48, color: "text.secondary", mb: 1 }}
          />
          <Typography variant="body1" fontWeight={500}>
            Drag a CSV file here, or click to browse
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Digication export CSV format
          </Typography>
          {/* Hidden file input */}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </Box>
      )}

      {/* Step 2: Previewing (loading) */}
      {step === "previewing" && (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography sx={{ mb: 2 }}>
            Analyzing <strong>{file?.name}</strong>...
          </Typography>
          <LinearProgress />
        </Box>
      )}

      {/* Step 3: Show preview results */}
      {step === "preview" && preview && (
        <Box>
          <Typography variant="h6" fontWeight={500} gutterBottom>
            Preview: {file?.name}
          </Typography>

          {preview.detectedInstitutionName && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Detected institution: <strong>{preview.detectedInstitutionName}</strong>
            </Alert>
          )}

          {!preview.detectedInstitutionId && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Could not detect an institution from this CSV. Make sure the CSV
              contains Digication submission URLs.
            </Alert>
          )}

          <Table size="small" sx={{ mb: 2 }}>
            <TableBody>
              <TableRow>
                <TableCell>Total rows in file</TableCell>
                <TableCell align="right"><strong>{preview.totalRows}</strong></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>New comments</TableCell>
                <TableCell align="right"><strong>{preview.newComments}</strong></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  {replaceMode
                    ? "Existing comments to update"
                    : "Duplicate comments (will be skipped)"}
                </TableCell>
                <TableCell align="right">
                  <strong>{preview.duplicateComments}</strong>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>New threads</TableCell>
                <TableCell align="right"><strong>{preview.newThreads}</strong></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>New students</TableCell>
                <TableCell align="right"><strong>{preview.newStudents}</strong></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>New assignments</TableCell>
                <TableCell align="right"><strong>{preview.newAssignments}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {preview.duplicateComments > 0 && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.target.checked)}
                />
              }
              label="Replace existing data with this file's version (use when re-uploading cleaner data)"
              sx={{ mb: 2 }}
            />
          )}

          <Box sx={{ display: "flex", gap: 2 }}>
            <Button variant="outlined" onClick={handleReset}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCommit}
              disabled={!preview.detectedInstitutionId}
            >
              {replaceMode ? "Confirm Upload & Replace" : "Confirm Upload"}
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 4: Committing (loading) */}
      {step === "committing" && (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography sx={{ mb: 2 }}>
            Uploading and processing <strong>{file?.name}</strong>...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This may take a moment — extracting TORI tags from each conversation.
          </Typography>
          <LinearProgress />
        </Box>
      )}

      {/* Step 5: Done! */}
      {step === "done" && commitResult && (
        <Box sx={{ textAlign: "center", py: 2 }}>
          <CheckCircleOutlineIcon
            sx={{ fontSize: 48, color: "success.main", mb: 1 }}
          />
          <Typography variant="h6" fontWeight={500} gutterBottom>
            Upload Complete
          </Typography>

          <Table size="small" sx={{ mb: 3, maxWidth: 400, mx: "auto" }}>
            <TableBody>
              <TableRow>
                <TableCell>Comments imported</TableCell>
                <TableCell align="right"><strong>{commitResult.newComments}</strong></TableCell>
              </TableRow>
              {commitResult.updatedComments > 0 && (
                <TableRow>
                  <TableCell>Comments updated</TableCell>
                  <TableCell align="right"><strong>{commitResult.updatedComments}</strong></TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell>Threads created</TableCell>
                <TableCell align="right"><strong>{commitResult.newThreads}</strong></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Students added</TableCell>
                <TableCell align="right"><strong>{commitResult.newStudents}</strong></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>TORI tags extracted</TableCell>
                <TableCell align="right"><strong>{commitResult.toriTagsExtracted}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Button variant="outlined" onClick={handleReset}>
            Upload Another File
          </Button>
        </Box>
      )}
    </Paper>
  );
}

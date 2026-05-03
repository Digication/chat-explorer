/**
 * Dialog used to upload a PDF or DOCX artifact. Posts to the REST
 * endpoint `/api/artifacts/upload` (not GraphQL — multer needs a
 * multipart body).
 *
 * Faculty: must pick course, student, optional assignment + title.
 * Student: server resolves studentId from session, but the student
 *          still needs to pick the course.
 */
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { useQuery } from "@apollo/client/react";
import { GET_COURSES, GET_ASSIGNMENTS, GET_ME } from "@/lib/queries/analytics";
import { GET_STUDENTS } from "@/lib/queries/student";
import { API_BASE } from "@/lib/api-base";
import { useAuth } from "@/lib/AuthProvider";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful upload with the created artifact id. */
  onUploaded?: (artifactId: string) => void;
  /**
   * Optionally pre-select a course/assignment so the dialog skips the
   * pickers. Useful when launched from a course/assignment page.
   */
  defaultCourseId?: string;
  defaultAssignmentId?: string;
  defaultStudentId?: string;
}

// A friendly list of the upload-supported mime types plus their
// extensions, kept in lock-step with the server's allow-list.
const ACCEPT_ATTR = ".pdf,.docx";

const ARTIFACT_TYPES = [
  { value: "PAPER", label: "Paper" },
  { value: "PRESENTATION", label: "Presentation" },
  { value: "CODE", label: "Code" },
  { value: "PORTFOLIO", label: "Portfolio" },
];

export default function UploadArtifactDialog({
  open,
  onClose,
  onUploaded,
  defaultCourseId,
  defaultAssignmentId,
  defaultStudentId,
}: Props) {
  const { user } = useAuth();
  const isStudent = user?.role === "student";

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [courseId, setCourseId] = useState<string>(defaultCourseId ?? "");
  const [assignmentId, setAssignmentId] = useState<string>(
    defaultAssignmentId ?? ""
  );
  const [studentId, setStudentId] = useState<string>(defaultStudentId ?? "");
  const [title, setTitle] = useState("");
  const [artifactType, setArtifactType] = useState("PAPER");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Look up the current user's institution (needed to filter the
  // students dropdown for faculty).
  const { data: meData } = useQuery<any>(GET_ME);
  const institutionId: string | undefined = meData?.me?.institutionId;

  const { data: coursesData, loading: coursesLoading } = useQuery<any>(
    GET_COURSES,
    {
      variables: { institutionId: institutionId ?? null },
      skip: !open,
    }
  );

  const { data: assignmentsData } = useQuery<any>(GET_ASSIGNMENTS, {
    variables: { courseId },
    skip: !courseId,
  });

  const { data: studentsData } = useQuery<any>(GET_STUDENTS, {
    variables: { institutionId },
    skip: !institutionId || isStudent,
  });

  const courses = coursesData?.courses ?? [];
  const assignments = assignmentsData?.assignments ?? [];
  const students = studentsData?.students ?? [];

  const canSubmit = useMemo(() => {
    if (!file || !courseId) return false;
    if (!isStudent && !studentId) return false;
    return true;
  }, [file, courseId, studentId, isStudent]);

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    // Quick client-side extension check so we don't upload a 10 MB junk
    // blob; the server re-validates mime + content.
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
      setError("Only PDF and DOCX files are supported.");
      return;
    }
    // 20 MB client-side cap (matches MAX_UPLOAD_BYTES on the server).
    if (f.size > 20 * 1024 * 1024) {
      setError("File is larger than 20 MB.");
      return;
    }
    setFile(f);
    // Default the title to the filename (without extension) on first pick.
    if (!title) {
      const dot = f.name.lastIndexOf(".");
      setTitle(dot > 0 ? f.name.slice(0, dot) : f.name);
    }
  };

  const handleSubmit = async () => {
    if (!file || !courseId) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("courseId", courseId);
      if (assignmentId) form.append("assignmentId", assignmentId);
      if (!isStudent && studentId) form.append("studentId", studentId);
      if (title) form.append("title", title);
      form.append("type", artifactType);

      const res = await fetch(`${API_BASE}/api/artifacts/upload`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }
      const data: { id: string } = await res.json();
      onUploaded?.(data.id);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFile(null);
    setCourseId(defaultCourseId ?? "");
    setAssignmentId(defaultAssignmentId ?? "");
    setStudentId(defaultStudentId ?? "");
    setTitle("");
    setArtifactType("PAPER");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload Artifact</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* File picker */}
          <Box
            onClick={() => inputRef.current?.click()}
            sx={{
              border: "2px dashed",
              borderColor: "divider",
              borderRadius: 1,
              p: 3,
              textAlign: "center",
              cursor: "pointer",
              "&:hover": {
                borderColor: "primary.main",
                bgcolor: "action.hover",
              },
            }}
          >
            <CloudUploadOutlinedIcon
              sx={{ fontSize: 36, color: "text.secondary", mb: 0.5 }}
            />
            <Typography variant="body2" fontWeight={500}>
              {file ? file.name : "Click to choose a PDF or DOCX"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Max 20 MB
            </Typography>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              hidden
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </Box>

          <TextField
            label="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            size="small"
          />

          <TextField
            label="Type"
            select
            value={artifactType}
            onChange={(e) => setArtifactType(e.target.value)}
            fullWidth
            size="small"
          >
            {ARTIFACT_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Course"
            select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setAssignmentId("");
            }}
            fullWidth
            size="small"
            disabled={coursesLoading}
          >
            {courses.map((c: { id: string; name: string }) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>

          {courseId && (
            <TextField
              label="Assignment (optional)"
              select
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {assignments.map((a: { id: string; name: string }) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {!isStudent && (
            <TextField
              label="Student"
              select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              fullWidth
              size="small"
            >
              {students.map(
                (s: { id: string; firstName: string; lastName: string }) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </MenuItem>
                )
              )}
            </TextField>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={uploading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit || uploading}
          startIcon={
            uploading ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

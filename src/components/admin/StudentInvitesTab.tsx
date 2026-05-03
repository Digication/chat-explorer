import { useState } from "react";
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Alert,
  Skeleton,
  Typography,
  InputAdornment,
  Checkbox,
  Chip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useQuery, useMutation } from "@apollo/client/react";
import { GET_INSTITUTIONS } from "@/lib/queries/admin";
import {
  GET_STUDENTS,
  INVITE_STUDENT,
  BULK_INVITE_STUDENTS,
} from "@/lib/queries/student";
import { useAuth } from "@/lib/AuthProvider";

interface StudentRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  userId: string | null;
  institutionId: string;
}

export default function StudentInvitesTab() {
  const { user } = useAuth();
  const isDigicationAdmin = user?.role === "digication_admin";

  // For digication admins, show institution picker; otherwise use their own
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(
    user?.institutionId ?? ""
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const institutionId = isDigicationAdmin
    ? selectedInstitutionId
    : (user?.institutionId ?? "");

  const { data: instData } = useQuery<any>(GET_INSTITUTIONS, {
    skip: !isDigicationAdmin,
  });

  const { data, loading, refetch } = useQuery<any>(GET_STUDENTS, {
    variables: { institutionId, search: search || undefined },
    skip: !institutionId,
  });

  const [inviteStudent, { loading: inviting }] = useMutation<any>(INVITE_STUDENT);
  const [bulkInvite, { loading: bulkInviting }] = useMutation<any>(
    BULK_INVITE_STUDENTS
  );

  const students: StudentRow[] = data?.students ?? [];

  // Students that haven't been invited yet (no userId)
  const uninvitedStudents = students.filter((s) => !s.userId);

  const handleInvite = async (studentId: string) => {
    try {
      const { data: result } = await inviteStudent({
        variables: { studentId },
      });
      setFeedback({
        type: "success",
        message: `Invitation sent to ${result.inviteStudent.email}`,
      });
      refetch();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to invite",
      });
    }
  };

  const handleBulkInvite = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    try {
      const { data: result } = await bulkInvite({
        variables: { studentIds: ids },
      });
      const results = result.bulkInviteStudents;
      const successes = results.filter(
        (r: { error: string | null }) => !r.error
      ).length;
      const failures = results.filter(
        (r: { error: string | null }) => r.error
      ).length;

      setFeedback({
        type: failures > 0 ? "error" : "success",
        message:
          failures > 0
            ? `${successes} invited, ${failures} failed`
            : `${successes} student${successes === 1 ? "" : "s"} invited`,
      });
      setSelected(new Set());
      refetch();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Bulk invite failed",
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === uninvitedStudents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(uninvitedStudents.map((s) => s.id)));
    }
  };

  const displayName = (s: StudentRow) =>
    [s.firstName, s.lastName].filter(Boolean).join(" ") || "Unnamed";

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Invite students to access their own dashboard. Students will receive a
        magic link email to sign in.
      </Typography>

      {feedback && (
        <Alert
          severity={feedback.type}
          onClose={() => setFeedback(null)}
          sx={{ mb: 2 }}
        >
          {feedback.message}
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}>
        {isDigicationAdmin && instData && (
          <TextField
            select
            label="Institution"
            value={selectedInstitutionId}
            onChange={(e) => {
              setSelectedInstitutionId(e.target.value);
              setSelected(new Set());
            }}
            size="small"
            sx={{ minWidth: 200 }}
          >
            {instData.institutions.map(
              (inst: { id: string; name: string }) => (
                <MenuItem key={inst.id} value={inst.id}>
                  {inst.name}
                </MenuItem>
              )
            )}
          </TextField>
        )}

        <TextField
          size="small"
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 250 }}
        />

        {selected.size > 0 && (
          <Button
            variant="contained"
            size="small"
            onClick={handleBulkInvite}
            disabled={bulkInviting}
            startIcon={<SendOutlinedIcon />}
          >
            Invite {selected.size} selected
          </Button>
        )}
      </Box>

      {!institutionId ? (
        <Typography color="text.secondary">
          Select an institution to see students.
        </Typography>
      ) : loading ? (
        <Box>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </Box>
      ) : students.length === 0 ? (
        <Typography color="text.secondary">
          No students found. Students appear here after CSV data is uploaded.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={
                    selected.size > 0 &&
                    selected.size < uninvitedStudents.length
                  }
                  checked={
                    uninvitedStudents.length > 0 &&
                    selected.size === uninvitedStudents.length
                  }
                  onChange={toggleAll}
                  disabled={uninvitedStudents.length === 0}
                />
              </TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((student) => {
              const invited = !!student.userId;
              return (
                <TableRow key={student.id}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.has(student.id)}
                      onChange={() => toggleSelect(student.id)}
                      disabled={invited}
                    />
                  </TableCell>
                  <TableCell>{displayName(student)}</TableCell>
                  <TableCell>{student.email || "—"}</TableCell>
                  <TableCell>
                    {invited ? (
                      <Chip
                        icon={<CheckCircleOutlineIcon />}
                        label="Invited"
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    ) : student.email ? (
                      <Chip
                        label="Not invited"
                        size="small"
                        variant="outlined"
                      />
                    ) : (
                      <Chip
                        label="No email"
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {!invited && student.email && (
                      <Button
                        size="small"
                        startIcon={<SendOutlinedIcon />}
                        onClick={() => handleInvite(student.id)}
                        disabled={inviting}
                      >
                        Invite
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

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
  Chip,
} from "@mui/material";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  GET_COURSES,
  GET_COURSE_ACCESS_LIST,
  REVOKE_COURSE_ACCESS,
} from "@/lib/queries/admin";
import { useAuth } from "@/lib/AuthProvider";
import GrantAccessDialog from "./GrantAccessDialog";

interface AccessRecord {
  id: string;
  userId: string;
  courseId: string;
  accessLevel: string;
  grantedAt: string;
  user: { id: string; name: string; email: string } | null;
}

export default function CourseAccessTab() {
  const { user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [grantOpen, setGrantOpen] = useState(false);

  const { data: coursesData, loading: coursesLoading } = useQuery<any>(
    GET_COURSES,
    {
      variables: {
        institutionId: user?.institutionId || undefined,
      },
    }
  );

  const {
    data: accessData,
    loading: accessLoading,
    error: accessError,
    refetch,
  } = useQuery<any>(GET_COURSE_ACCESS_LIST, {
    variables: { courseId: selectedCourseId },
    skip: !selectedCourseId,
  });

  const [revokeAccess] = useMutation(REVOKE_COURSE_ACCESS, {
    onCompleted: () => refetch(),
  });

  const handleRevoke = (userId: string) => {
    revokeAccess({
      variables: { userId, courseId: selectedCourseId },
    });
  };

  const courses = coursesData?.courses ?? [];
  const accessList: AccessRecord[] = accessData?.courseAccessList ?? [];

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 3,
          alignItems: "center",
        }}
      >
        <TextField
          size="small"
          select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          label="Course"
          sx={{ minWidth: 300 }}
          disabled={coursesLoading}
        >
          {courses.map((c: { id: string; name: string }) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>

        <Box sx={{ flex: 1 }} />

        {selectedCourseId && (
          <Button
            variant="contained"
            onClick={() => setGrantOpen(true)}
          >
            Grant Access
          </Button>
        )}
      </Box>

      {!selectedCourseId ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          Select a course to manage access.
        </Typography>
      ) : accessError ? (
        <Alert
          severity="error"
          action={
            <Button onClick={() => refetch()} size="small">
              Retry
            </Button>
          }
        >
          {accessError.message}
        </Alert>
      ) : accessLoading ? (
        <Box>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </Box>
      ) : accessList.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          No users have access to this course yet.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Access Level</TableCell>
              <TableCell>Granted</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accessList.map((record) => (
              <TableRow key={record.id} hover>
                <TableCell>{record.user?.name ?? "—"}</TableCell>
                <TableCell>{record.user?.email ?? "—"}</TableCell>
                <TableCell>
                  <Chip
                    label={record.accessLevel}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {new Date(record.grantedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleRevoke(record.userId)}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Grant access dialog */}
      {selectedCourseId && (
        <GrantAccessDialog
          open={grantOpen}
          onClose={() => setGrantOpen(false)}
          courseId={selectedCourseId}
        />
      )}
    </Box>
  );
}

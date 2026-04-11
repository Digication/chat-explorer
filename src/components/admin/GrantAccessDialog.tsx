import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Alert,
  Box,
} from "@mui/material";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  GRANT_COURSE_ACCESS,
  GET_COURSE_ACCESS_LIST,
  GET_USERS,
} from "@/lib/queries/admin";

interface Props {
  open: boolean;
  onClose: () => void;
  courseId: string;
}

export default function GrantAccessDialog({
  open,
  onClose,
  courseId,
}: Props) {
  const [userId, setUserId] = useState("");
  const [accessLevel, setAccessLevel] = useState("collaborator");
  const [error, setError] = useState<string | null>(null);

  const { data: usersData } = useQuery<any>(GET_USERS, {
    variables: {},
    skip: !open,
  });

  const [grantAccess, { loading }] = useMutation(GRANT_COURSE_ACCESS, {
    refetchQueries: [
      { query: GET_COURSE_ACCESS_LIST, variables: { courseId } },
    ],
    onCompleted: () => {
      setUserId("");
      setAccessLevel("collaborator");
      onClose();
    },
    onError: (err: { message: string }) => setError(err.message),
  });

  const handleSubmit = () => {
    setError(null);

    if (!userId) {
      setError("Please select a user.");
      return;
    }

    grantAccess({
      variables: { userId, courseId, accessLevel },
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Grant Course Access</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="User"
            select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            fullWidth
            size="small"
          >
            {usersData?.users?.map(
              (u: { id: string; name: string; email: string }) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </MenuItem>
              )
            )}
          </TextField>
          <TextField
            label="Access Level"
            select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value)}
            fullWidth
            size="small"
          >
            <MenuItem value="collaborator">Collaborator</MenuItem>
            <MenuItem value="owner">Owner</MenuItem>
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          Grant Access
        </Button>
      </DialogActions>
    </Dialog>
  );
}

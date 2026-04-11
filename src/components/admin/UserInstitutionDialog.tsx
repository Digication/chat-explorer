import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Alert,
} from "@mui/material";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  UPDATE_USER_INSTITUTION,
  GET_USERS,
  GET_INSTITUTIONS,
} from "@/lib/queries/admin";

interface Props {
  open: boolean;
  onClose: () => void;
  user: { id: string; name: string; institutionId: string | null } | null;
}

export default function UserInstitutionDialog({
  open,
  onClose,
  user: targetUser,
}: Props) {
  const [institutionId, setInstitutionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: instData } = useQuery<any>(GET_INSTITUTIONS);

  const [updateInstitution, { loading }] = useMutation(
    UPDATE_USER_INSTITUTION,
    {
      refetchQueries: [{ query: GET_USERS }],
      onCompleted: () => onClose(),
      onError: (err: { message: string }) => setError(err.message),
    }
  );

  useEffect(() => {
    if (targetUser) {
      setInstitutionId(targetUser.institutionId || "");
    }
  }, [targetUser, open]);

  const handleSubmit = () => {
    setError(null);
    if (!targetUser) return;

    updateInstitution({
      variables: {
        userId: targetUser.id,
        institutionId: institutionId || null,
      },
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Assign Institution — {targetUser?.name}
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          label="Institution"
          select
          value={institutionId}
          onChange={(e) => setInstitutionId(e.target.value)}
          fullWidth
          size="small"
          sx={{ mt: 1 }}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {instData?.institutions?.map(
            (inst: { id: string; name: string }) => (
              <MenuItem key={inst.id} value={inst.id}>
                {inst.name}
              </MenuItem>
            )
          )}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

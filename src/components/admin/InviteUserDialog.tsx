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
  INVITE_USER,
  GET_USERS,
  GET_INSTITUTIONS,
} from "@/lib/queries/admin";
import { useAuth } from "@/lib/AuthProvider";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ROLES = [
  { value: "instructor", label: "Instructor" },
  { value: "institution_admin", label: "Institution Admin" },
  { value: "digication_admin", label: "Digication Admin" },
];

export default function InviteUserDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const isDigicationAdmin = user?.role === "digication_admin";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [institutionId, setInstitutionId] = useState(
    user?.institutionId || ""
  );
  const [role, setRole] = useState("instructor");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data: instData } = useQuery<any>(GET_INSTITUTIONS, {
    skip: !isDigicationAdmin,
  });

  const [inviteUser, { loading }] = useMutation(INVITE_USER, {
    refetchQueries: [{ query: GET_USERS }],
    onCompleted: () => {
      setSuccess(true);
      setEmail("");
      setName("");
      setRole("instructor");
    },
    onError: (err: { message: string }) => {
      setError(err.message);
    },
  });

  const handleSubmit = () => {
    setError(null);
    setSuccess(false);

    if (!email.trim() || !name.trim() || !institutionId) {
      setError("All fields are required.");
      return;
    }

    inviteUser({
      variables: { email: email.trim(), name: name.trim(), institutionId, role },
    });
  };

  const handleClose = () => {
    setError(null);
    setSuccess(false);
    setEmail("");
    setName("");
    setRole("instructor");
    onClose();
  };

  // Filter roles based on current user's permissions
  const availableRoles = isDigicationAdmin
    ? ROLES
    : ROLES.filter((r) => r.value !== "digication_admin");

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Invite User</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && (
            <Alert severity="success">
              Invitation sent! The user will receive a magic link email.
            </Alert>
          )}

          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            size="small"
          />
          {isDigicationAdmin ? (
            <TextField
              label="Institution"
              select
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              fullWidth
              size="small"
            >
              {instData?.institutions?.map(
                (inst: { id: string; name: string }) => (
                  <MenuItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </MenuItem>
                )
              )}
            </TextField>
          ) : (
            <TextField
              label="Institution"
              value="Your institution"
              disabled
              fullWidth
              size="small"
            />
          )}
          <TextField
            label="Role"
            select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            fullWidth
            size="small"
          >
            {availableRoles.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? "Sending..." : "Send Invitation"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

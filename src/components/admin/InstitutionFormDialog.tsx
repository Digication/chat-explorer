import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
} from "@mui/material";
import { useMutation } from "@apollo/client/react";
import {
  CREATE_INSTITUTION,
  UPDATE_INSTITUTION,
  GET_INSTITUTIONS,
} from "@/lib/queries/admin";

interface Institution {
  id: string;
  name: string;
  domain: string | null;
  slug: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  institution?: Institution | null; // null = create mode
}

export default function InstitutionFormDialog({
  open,
  onClose,
  institution,
}: Props) {
  const isEdit = !!institution;

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (institution) {
      setName(institution.name);
      setDomain(institution.domain || "");
      setSlug(institution.slug || "");
    } else {
      setName("");
      setDomain("");
      setSlug("");
    }
  }, [institution, open]);

  const [createInstitution, { loading: creating }] = useMutation(
    CREATE_INSTITUTION,
    {
      refetchQueries: [{ query: GET_INSTITUTIONS }],
      onCompleted: () => handleClose(),
      onError: (err: { message: string }) => setError(err.message),
    }
  );

  const [updateInstitution, { loading: updating }] = useMutation(
    UPDATE_INSTITUTION,
    {
      refetchQueries: [{ query: GET_INSTITUTIONS }],
      onCompleted: () => handleClose(),
      onError: (err: { message: string }) => setError(err.message),
    }
  );

  const handleSubmit = () => {
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    if (isEdit) {
      updateInstitution({
        variables: {
          id: institution!.id,
          name: name.trim(),
          domain: domain.trim() || null,
          slug: slug.trim() || null,
        },
      });
    } else {
      createInstitution({
        variables: {
          name: name.trim(),
          domain: domain.trim() || null,
          slug: slug.trim() || null,
        },
      });
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEdit ? "Edit Institution" : "Create Institution"}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g., bucknell.edu"
            fullWidth
            size="small"
          />
          <TextField
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g., bucknell"
            fullWidth
            size="small"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={creating || updating}
        >
          {isEdit ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

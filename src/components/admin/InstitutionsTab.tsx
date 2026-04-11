import { useState } from "react";
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Alert,
  Skeleton,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { useQuery } from "@apollo/client/react";
import { GET_INSTITUTIONS } from "@/lib/queries/admin";
import InstitutionFormDialog from "./InstitutionFormDialog";

interface Institution {
  id: string;
  name: string;
  domain: string | null;
  slug: string | null;
}

export default function InstitutionsTab() {
  const { data, loading, error, refetch } = useQuery<any>(GET_INSTITUTIONS);
  const [createOpen, setCreateOpen] = useState(false);
  const [editInst, setEditInst] = useState<Institution | null>(null);

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button onClick={() => refetch()} size="small">
            Retry
          </Button>
        }
      >
        {error.message}
      </Alert>
    );
  }

  const institutions: Institution[] = data?.institutions ?? [];

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Create Institution
        </Button>
      </Box>

      {loading ? (
        <Box>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </Box>
      ) : institutions.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          No institutions yet.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Domain</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {institutions.map((inst) => (
              <TableRow key={inst.id} hover>
                <TableCell>{inst.name}</TableCell>
                <TableCell>{inst.domain || "—"}</TableCell>
                <TableCell>{inst.slug || "—"}</TableCell>
                <TableCell>
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={() => setEditInst(inst)}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create dialog */}
      <InstitutionFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      {/* Edit dialog */}
      <InstitutionFormDialog
        open={!!editInst}
        onClose={() => setEditInst(null)}
        institution={editInst}
      />
    </Box>
  );
}

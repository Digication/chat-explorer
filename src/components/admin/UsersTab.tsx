import { useState, useMemo } from "react";
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
  TableSortLabel,
  Select,
  IconButton,
  Tooltip,
  Alert,
  Skeleton,
  Typography,
  InputAdornment,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  GET_USERS,
  GET_INSTITUTIONS,
  ASSIGN_ROLE,
  RESEND_INVITATION,
  SET_USER_DEACTIVATED,
} from "@/lib/queries/admin";
import { useAuth } from "@/lib/AuthProvider";
import InviteUserDialog from "./InviteUserDialog";
import UserInstitutionDialog from "./UserInstitutionDialog";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  deactivated: boolean;
  institutionId: string | null;
  institution: { id: string; name: string } | null;
  invitedAt: string | null;
  lastInvitedAt: string | null;
}

type SortKey = "name" | "email" | "role" | "institution" | "status";
type SortDir = "asc" | "desc";

const ROLE_LABELS: Record<string, string> = {
  instructor: "Instructor",
  institution_admin: "Institution Admin",
  digication_admin: "Digication Admin",
};

export default function UsersTab() {
  const { user } = useAuth();
  const isDigicationAdmin = user?.role === "digication_admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterInstitutionId, setFilterInstitutionId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editInstUser, setEditInstUser] = useState<UserRow | null>(null);

  // Debounce search input
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => setDebouncedSearch(value), 300);
    setDebounceTimer(timer);
  };

  const { data, loading, error, refetch } = useQuery<any>(GET_USERS, {
    variables: {
      search: debouncedSearch || undefined,
      institutionId: filterInstitutionId || undefined,
    },
  });

  const { data: instData } = useQuery<any>(GET_INSTITUTIONS, {
    skip: !isDigicationAdmin,
  });

  const [assignRole] = useMutation(ASSIGN_ROLE, {
    onCompleted: () => refetch(),
  });

  const [resendInvitation, { loading: resending }] = useMutation(
    RESEND_INVITATION,
    { onCompleted: () => refetch() }
  );

  const [setUserDeactivated] = useMutation(SET_USER_DEACTIVATED, {
    onCompleted: () => refetch(),
  });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const users: UserRow[] = data?.users ?? [];

  const sorted = useMemo(() => {
    return [...users].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "email":
          cmp = a.email.localeCompare(b.email);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "institution":
          cmp = (a.institution?.name || "").localeCompare(
            b.institution?.name || ""
          );
          break;
        case "status": {
          const aStatus = a.emailVerified ? 1 : 0;
          const bStatus = b.emailVerified ? 1 : 0;
          cmp = aStatus - bStatus;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, sortKey, sortDir]);

  const handleRoleChange = (userId: string, newRole: string) => {
    assignRole({ variables: { userId, role: newRole } });
  };

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

  return (
    <Box>
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 3,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <TextField
          size="small"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ minWidth: 260 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />

        {isDigicationAdmin && (
          <TextField
            size="small"
            select
            value={filterInstitutionId}
            onChange={(e) => setFilterInstitutionId(e.target.value)}
            sx={{ minWidth: 200 }}
            label="Institution"
          >
            <MenuItem value="">All institutions</MenuItem>
            {instData?.institutions?.map(
              (inst: { id: string; name: string }) => (
                <MenuItem key={inst.id} value={inst.id}>
                  {inst.name}
                </MenuItem>
              )
            )}
          </TextField>
        )}

        <Box sx={{ flex: 1 }} />

        <Button
          variant="contained"
          startIcon={<PersonAddOutlinedIcon />}
          onClick={() => setInviteOpen(true)}
        >
          Invite User
        </Button>
      </Box>

      {/* Table */}
      {loading ? (
        <Box>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </Box>
      ) : sorted.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          No users found.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortKey === "name"}
                  direction={sortKey === "name" ? sortDir : "asc"}
                  onClick={() => handleSort("name")}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortKey === "email"}
                  direction={sortKey === "email" ? sortDir : "asc"}
                  onClick={() => handleSort("email")}
                >
                  Email
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortKey === "role"}
                  direction={sortKey === "role" ? sortDir : "asc"}
                  onClick={() => handleSort("role")}
                >
                  Role
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortKey === "institution"}
                  direction={sortKey === "institution" ? sortDir : "asc"}
                  onClick={() => handleSort("institution")}
                >
                  Institution
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortKey === "status"}
                  direction={sortKey === "status" ? sortDir : "asc"}
                  onClick={() => handleSort("status")}
                >
                  Status
                </TableSortLabel>
              </TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    variant="standard"
                    disableUnderline
                    sx={{ fontSize: "0.875rem" }}
                  >
                    {Object.entries(ROLE_LABELS)
                      .filter(
                        ([value]) =>
                          isDigicationAdmin ||
                          value !== "digication_admin"
                      )
                      .map(([value, label]) => (
                        <MenuItem key={value} value={value}>
                          {label}
                        </MenuItem>
                      ))}
                  </Select>
                </TableCell>
                <TableCell>
                  {u.institution?.name || (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      component="span"
                    >
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {u.deactivated ? (
                    <Typography
                      variant="body2"
                      sx={{ color: "error.main", fontWeight: 500 }}
                      component="span"
                    >
                      Deactivated
                    </Typography>
                  ) : u.emailVerified ? (
                    <Typography
                      variant="body2"
                      sx={{ color: "success.main", fontWeight: 500 }}
                      component="span"
                    >
                      Active
                    </Typography>
                  ) : (
                    <Tooltip
                      title={
                        u.lastInvitedAt &&
                        !isNaN(new Date(u.lastInvitedAt).getTime())
                          ? `Last invited ${new Date(u.lastInvitedAt).toLocaleDateString()}`
                          : "Invitation pending"
                      }
                    >
                      <Typography
                        variant="body2"
                        sx={{ color: "warning.main", fontWeight: 500 }}
                        component="span"
                      >
                        Pending
                      </Typography>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  {!u.emailVerified && !u.deactivated && (
                    <Tooltip title="Resend invitation email">
                      <IconButton
                        size="small"
                        disabled={resending}
                        onClick={() =>
                          resendInvitation({ variables: { userId: u.id } })
                        }
                      >
                        <SendOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {u.id !== user?.id && (
                    <Tooltip
                      title={
                        u.deactivated
                          ? "Reactivate account"
                          : "Deactivate account"
                      }
                    >
                      <IconButton
                        size="small"
                        onClick={() =>
                          setUserDeactivated({
                            variables: {
                              userId: u.id,
                              deactivated: !u.deactivated,
                            },
                          })
                        }
                      >
                        {u.deactivated ? (
                          <CheckCircleOutlineIcon
                            fontSize="small"
                            color="success"
                          />
                        ) : (
                          <BlockOutlinedIcon
                            fontSize="small"
                            color="error"
                          />
                        )}
                      </IconButton>
                    </Tooltip>
                  )}
                  {isDigicationAdmin && (
                    <Tooltip title="Change institution">
                      <IconButton
                        size="small"
                        onClick={() => setEditInstUser(u)}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Dialogs */}
      <InviteUserDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <UserInstitutionDialog
        open={!!editInstUser}
        onClose={() => setEditInstUser(null)}
        user={editInstUser}
      />
    </Box>
  );
}

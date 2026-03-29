import { useState } from "react";
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

interface ChatSessionSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatHistoryProps {
  /** List of past chat sessions. */
  sessions: ChatSessionSummary[];
  /** ID of the currently active session, or null if none. */
  activeSessionId: string | null;
  /** Called when the user selects a session. */
  onSelect: (id: string) => void;
  /** Called when the user confirms deletion of a session. */
  onDelete: (id: string) => void;
  /** Called when the user wants to start a new chat. */
  onNew: () => void;
}

/** Formats a date string into a short readable form (e.g. "Mar 28"). */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Sidebar list of past chat sessions with a "New Chat" button.
 * Sessions are sorted by most-recently-updated first.
 * Each session shows a delete icon on hover with a confirmation dialog.
 */
export default function ChatHistory({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onNew,
}: ChatHistoryProps) {
  // Track which session is pending deletion (for the confirmation dialog)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Sort sessions by updatedAt descending (most recent first)
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget);
      setDeleteTarget(null);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* New Chat button */}
      <Box sx={{ p: 1 }}>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          fullWidth
          onClick={onNew}
          size="small"
        >
          New Chat
        </Button>
      </Box>

      {/* Session list */}
      <List dense sx={{ flex: 1, overflowY: "auto", px: 0.5 }}>
        {sorted.map((session) => (
          <ListItemButton
            key={session.id}
            selected={session.id === activeSessionId}
            onClick={() => onSelect(session.id)}
            sx={{
              borderRadius: "6px",
              mb: 0.25,
              // Show delete icon only on hover
              "& .delete-btn": { opacity: 0 },
              "&:hover .delete-btn": { opacity: 1 },
            }}
          >
            <ListItemText
              primary={session.title || "Untitled chat"}
              secondary={formatDate(session.updatedAt)}
              primaryTypographyProps={{
                noWrap: true,
                variant: "body2",
              }}
              secondaryTypographyProps={{ variant: "caption" }}
            />
            <IconButton
              className="delete-btn"
              size="small"
              onClick={(e) => {
                // Prevent triggering the parent onSelect
                e.stopPropagation();
                setDeleteTarget(session.id);
              }}
              sx={{ ml: 0.5 }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </ListItemButton>
        ))}

        {sorted.length === 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 2 }}
          >
            No conversations yet
          </Typography>
        )}
      </List>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete conversation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete this conversation and all its messages. This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import {
  GET_STUDENT_ENGAGEMENT,
  SET_STUDENT_CONSENT,
  GET_CONSENT_SUMMARY,
} from "@/lib/queries/analytics";
import { useUserSettings } from "@/lib/UserSettingsContext";
import UserAvatar from "@/components/shared/UserAvatar";

interface StudentExclusionDialogProps {
  open: boolean;
  onClose: () => void;
  institutionId: string;
  courseId?: string;
}

export default function StudentExclusionDialog({
  open,
  onClose,
  institutionId,
  courseId,
}: StudentExclusionDialogProps) {
  const { getDisplayName } = useUserSettings();

  // Track which students have been toggled locally (optimistic)
  const [localExclusions, setLocalExclusions] = useState<
    Record<string, "INCLUDED" | "EXCLUDED">
  >({});

  const scope = useMemo(
    () => ({ institutionId, courseId }),
    [institutionId, courseId],
  );

  // Fetch student list from instructional insights
  const { data: studentData, loading: studentsLoading } = useQuery<any>(
    GET_STUDENT_ENGAGEMENT,
    {
      variables: { scope },
      skip: !open,
    },
  );

  // Fetch consent summary
  const { data: summaryData, refetch: refetchSummary } = useQuery<any>(
    GET_CONSENT_SUMMARY,
    {
      variables: { institutionId, courseId },
      skip: !open,
    },
  );

  const [setConsent, { loading: saving }] = useMutation(SET_STUDENT_CONSENT);

  const students =
    studentData?.instructionalInsights?.data?.studentProfiles ?? [];
  const summary = summaryData?.consentSummary;

  const handleToggle = async (
    studentId: string,
    currentlyIncluded: boolean,
  ) => {
    const newStatus = currentlyIncluded ? "EXCLUDED" : "INCLUDED";

    // Optimistic update
    setLocalExclusions((prev) => ({ ...prev, [studentId]: newStatus }));

    try {
      await setConsent({
        variables: {
          input: { studentId, institutionId, courseId, status: newStatus },
        },
      });
      refetchSummary();
    } catch {
      // Revert optimistic update on error
      setLocalExclusions((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    }
  };

  // Determine if a student is included — local state overrides server
  const isIncluded = (studentId: string) => {
    if (localExclusions[studentId]) {
      return localExclusions[studentId] === "INCLUDED";
    }
    // Default to included (consent system excludes explicitly)
    return true;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Manage Student Participation
        {summary && (
          <Typography variant="body2" color="text.secondary">
            {summary.consented} of {summary.total} students included
            {summary.excluded > 0 && ` · ${summary.excluded} excluded`}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {studentsLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {!studentsLoading && students.length === 0 && (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No students found for this scope.
          </Typography>
        )}

        {!studentsLoading && students.length > 0 && (
          <>
            {saving && (
              <Alert severity="info" sx={{ mb: 1 }}>
                Saving changes...
              </Alert>
            )}
            <List dense>
              {students.map(
                (s: { studentId: string; name: string; commentCount: number }) => {
                  const included = isIncluded(s.studentId);
                  return (
                    <ListItem
                      key={s.studentId}
                      secondaryAction={
                        <Switch
                          checked={included}
                          onChange={() => handleToggle(s.studentId, included)}
                          size="small"
                        />
                      }
                    >
                      <Box sx={{ mr: 1.5 }}>
                        <UserAvatar
                          name={getDisplayName(s.name)}
                          size={32}
                        />
                      </Box>
                      <ListItemText
                        primary={getDisplayName(s.name)}
                        secondary={`${s.commentCount} comment${s.commentCount !== 1 ? "s" : ""}`}
                      />
                    </ListItem>
                  );
                },
              )}
            </List>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

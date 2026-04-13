import React, { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { GET_STUDENT_PROFILES } from "@/lib/queries/explorer";
import { useInsightsScope } from "@/components/insights/ScopeSelector";
import { useUserSettings } from "@/lib/UserSettingsContext";

interface StudentOption {
  studentId: string;
  name: string;
}

interface StudentSearchAutocompleteProps {
  /** Called when a student is selected from the list. */
  onSelect: (studentId: string, studentName: string) => void;
  /** Currently selected student name (shown in the input when compact). */
  currentStudentName?: string;
}

export default function StudentSearchAutocomplete({
  onSelect,
  currentStudentName,
}: StudentSearchAutocompleteProps) {
  const { scope } = useInsightsScope();
  const { getDisplayName } = useUserSettings();

  const { data, loading } = useQuery<any>(GET_STUDENT_PROFILES, {
    variables: { scope },
    skip: !scope,
  });

  const students: StudentOption[] = useMemo(() => {
    const profiles = data?.instructionalInsights?.data?.studentProfiles ?? [];
    return profiles.map((p: any) => ({
      studentId: p.studentId,
      name: p.name,
    }));
  }, [data]);

  return (
    <Autocomplete
      size="small"
      options={students}
      getOptionLabel={(option) => getDisplayName(option.name)}
      loading={loading}
      onChange={(_, value) => {
        if (value) onSelect(value.studentId, value.name);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={currentStudentName ? getDisplayName(currentStudentName) : "Search for a student..."}
          variant="outlined"
          size="small"
        />
      )}
      isOptionEqualToValue={(option, value) => option.studentId === value.studentId}
      sx={{ mx: 1, mt: 1, mb: 0.5 }}
    />
  );
}

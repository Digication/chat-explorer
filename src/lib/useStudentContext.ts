import { useAuth } from "./AuthProvider";
import { useQuery } from "@apollo/client/react";
import { GET_MY_STUDENT_PROFILE } from "./queries/student";

/**
 * Provides the current student's profile data when logged in as a student.
 * Skips the query entirely for non-student users.
 */
export function useStudentContext() {
  const { user } = useAuth();
  const { data, loading } = useQuery<any>(GET_MY_STUDENT_PROFILE, {
    skip: user?.role !== "student",
  });

  return {
    student: data?.myStudentProfile ?? null,
    studentId: data?.myStudentProfile?.id ?? null,
    loading,
  };
}

import { useSearchParams } from "react-router";
import { Box, Tabs, Tab, Typography } from "@mui/material";
import { useAuth } from "@/lib/AuthProvider";
import UsersTab from "@/components/admin/UsersTab";
import InstitutionsTab from "@/components/admin/InstitutionsTab";
import CourseAccessTab from "@/components/admin/CourseAccessTab";
import AnalyticsTab from "@/components/admin/AnalyticsTab";

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "users";
  const { user } = useAuth();
  const isDigicationAdmin = user?.role === "digication_admin";

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", py: 4, px: 3 }}>
      <Typography variant="h5" fontWeight={500} gutterBottom>
        Admin Console
      </Typography>

      <Tabs value={currentTab} onChange={handleTabChange} sx={{ mb: 3 }}>
        <Tab label="Users" value="users" />
        {isDigicationAdmin && (
          <Tab label="Institutions" value="institutions" />
        )}
        <Tab label="Course Access" value="course-access" />
        <Tab label="Analytics" value="analytics" />
      </Tabs>

      {currentTab === "users" && <UsersTab />}
      {currentTab === "institutions" && isDigicationAdmin && (
        <InstitutionsTab />
      )}
      {currentTab === "course-access" && <CourseAccessTab />}
      {currentTab === "analytics" && <AnalyticsTab />}
    </Box>
  );
}

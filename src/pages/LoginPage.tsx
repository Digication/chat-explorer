import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Box, Button, Paper, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { useAuth } from "@/lib/AuthProvider";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect to home if already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSignIn = () => {
    // Navigate directly to Express on localhost:4000 so the OAuth state cookie
    // is set on the same domain where Google's callback will land.
    // After auth, Better Auth redirects back to chat-explorer.localhost.
    const callbackURL = encodeURIComponent(window.location.origin);
    window.location.href = `http://localhost:4000/auth/login/google?callbackURL=${callbackURL}`;
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#f5f7fa",
        }}
      >
        <Typography color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#f5f7fa",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 6,
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
          border: "1px solid #e0e0e0",
        }}
      >
        <Typography variant="h5" fontWeight={500} gutterBottom>
          Chat Explorer
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Academic reflection analysis platform
        </Typography>

        <Button
          variant="outlined"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={handleSignIn}
          fullWidth
          sx={{
            borderColor: "#dadce0",
            color: "#3c4043",
            "&:hover": {
              borderColor: "#d2e3fc",
              bgcolor: "#f8faff",
            },
          }}
        >
          Sign in with Google
        </Button>
      </Paper>
    </Box>
  );
}

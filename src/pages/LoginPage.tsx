import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Button,
  Paper,
  Typography,
  TextField,
  Divider,
  Alert,
  CircularProgress,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import { useAuth } from "@/lib/AuthProvider";
import { authClient } from "@/lib/auth-client";
import { API_BASE } from "@/lib/api-base";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to home if already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Check URL for error params from OAuth callback or expired magic link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (!errorParam) return;

    if (errorParam === "EXPIRED_TOKEN") {
      setError(
        "Your sign-in link has expired. Enter your email below and we'll send you a new one."
      );
    } else {
      setError(
        "No account found for this email. Contact your administrator to get an invitation."
      );
      // Admin notification is handled server-side via databaseHooks
    }
  }, []);

  const handleGoogleSignIn = () => {
    const callbackURL = encodeURIComponent(window.location.origin);
    window.location.href = `${API_BASE}/auth/login/google?callbackURL=${callbackURL}`;
  };

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setMagicLinkLoading(true);
    setError(null);

    try {
      const result = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: window.location.origin,
      });

      if (result.error) {
        setError(
          "No account found for this email. Contact your administrator to get an invitation."
        );
      } else {
        setMagicLinkSent(true);
      }
    } catch {
      setError(
        "No account found for this email. Contact your administrator to get an invitation."
      );
    } finally {
      setMagicLinkLoading(false);
    }
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

        {error && (
          <Alert severity="error" sx={{ mb: 3, textAlign: "left" }}>
            {error}
          </Alert>
        )}

        <Button
          variant="outlined"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={handleGoogleSignIn}
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

        <Divider sx={{ my: 3 }}>
          <Typography variant="body2" color="text.secondary">
            or
          </Typography>
        </Divider>

        {magicLinkSent ? (
          <Alert severity="success" sx={{ textAlign: "left" }}>
            Check your email for a sign-in link. It expires in 1 hour.
          </Alert>
        ) : (
          <Box>
            <TextField
              fullWidth
              size="small"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleMagicLink();
              }}
              sx={{ mb: 2 }}
            />
            <Button
              variant="outlined"
              size="large"
              startIcon={
                magicLinkLoading ? (
                  <CircularProgress size={18} />
                ) : (
                  <EmailOutlinedIcon />
                )
              }
              onClick={handleMagicLink}
              disabled={magicLinkLoading}
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
              Send magic link
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

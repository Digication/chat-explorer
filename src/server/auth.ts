import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import sgMail from "@sendgrid/mail";
import pg from "pg";

// Configure SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@digication.com";

// Track pending invitations so the sendMagicLink callback can send
// the right email template. Maps email → inviter name.
const pendingInvitations = new Map<string, string>();

export const auth = betterAuth({
  database: new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Sign-up is blocked via databaseHooks below instead of disableSignUp,
      // so that we have the user's real email/name for admin notifications.
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Only pre-invited users (already in the DB) should sign in.
          // If Better Auth tries to create a new user, it means an
          // uninvited person attempted Google sign-in.  Notify the admin
          // with their real name/email, then block the creation.
          const email = user.email as string;
          const name = (user.name as string) || "Unknown";
          notifyAdminOfBlockedSignIn(name, email).catch((err) => {
            console.error("[auth] Failed to send blocked sign-in notification:", err);
          });
          console.log(`[auth] Blocked sign-in attempt from ${email} (${name})`);
          return false; // prevent user creation
        },
      },
    },
  },
  plugins: [
    magicLink({
      disableSignUp: true, // Only existing users can request magic links
      expiresIn: 3600, // 1 hour (in seconds)
      sendMagicLink: async ({ email, url }) => {
        if (!process.env.SENDGRID_API_KEY) {
          // Dev mode — log the magic link to console
          console.log(`[magic-link] Link for ${email}: ${url}`);
          return;
        }

        const inviterName = pendingInvitations.get(email);
        pendingInvitations.delete(email);

        if (inviterName) {
          // Invitation email for new users
          await sgMail.send({
            to: email,
            from: FROM_EMAIL,
            subject: "You are invited to Digication Chat Explorer",
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #333;">Welcome to Digication Chat Explorer</h2>
                <p>${inviterName} has invited you to Digication Chat Explorer, a private beta tool for exploring and analyzing student chat conversations with AI insights.</p>
                <p>Click below to set up your account and get started.</p>
                <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1976d2; color: #fff; text-decoration: none; border-radius: 4px; margin: 20px 0;">
                  Get Started
                </a>
                <p style="color: #999; font-size: 12px;">If you weren't expecting this invitation, you can safely ignore this email. No account will be created.</p>
                <p style="color: #555; margin-top: 24px;">Sincerely,<br/>Your Friends at Digication</p>
              </div>
            `,
            trackingSettings: {
              clickTracking: { enable: false, enableText: false },
            },
          });
        } else {
          // Regular sign-in email for returning users
          await sgMail.send({
            to: email,
            from: FROM_EMAIL,
            subject: "Your Digication Chat Explorer sign-in link",
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #333;">Sign in to Digication Chat Explorer</h2>
                <p>Here's your sign-in link.</p>
                <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1976d2; color: #fff; text-decoration: none; border-radius: 4px; margin: 20px 0;">
                  Sign in
                </a>
                <p style="color: #999; font-size: 12px;">If you didn't request this link, you can safely ignore this email. Your account is secure.</p>
                <p style="color: #555; margin-top: 24px;">Sincerely,<br/>Your Friends at Digication</p>
              </div>
            `,
            trackingSettings: {
              clickTracking: { enable: false, enableText: false },
            },
          });
        }
      },
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:4000",
    process.env.APP_URL,
    "https://chat-explorer.localhost",
  ].filter(Boolean) as string[],
  advanced: {
    // Chrome treats localhost as a "secure context" even over HTTP,
    // so Secure cookies work. We need SameSite=None so the cookie
    // is sent on cross-origin requests from chat-explorer.localhost to localhost:4000.
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: "none" as const,
      secure: true,
    },
  },
});

/**
 * Send a notification email to the bootstrap admin when an uninvited
 * user tries to sign in via Google OAuth.
 */
export async function notifyAdminOfBlockedSignIn(
  name: string,
  email: string
) {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!adminEmail) {
    console.log(
      `[auth] Blocked sign-in attempt from ${email} (${name}) — no BOOTSTRAP_ADMIN_EMAIL set to notify`
    );
    return;
  }

  if (!process.env.SENDGRID_API_KEY) {
    console.log(
      `[auth] Blocked sign-in attempt from ${email} (${name}) — would notify ${adminEmail}`
    );
    return;
  }

  await sgMail.send({
    to: adminEmail,
    from: FROM_EMAIL,
    subject: `Digication Chat Explorer: New sign-in request from ${name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #333;">New Sign-in Request</h2>
        <p><strong>${name}</strong> (${email}) tried to sign in to Digication Chat Explorer but doesn't have an account yet.</p>
        <p>To invite them, open the Admin Console and use "Invite User."</p>
      </div>
    `,
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
    },
  });
}

/**
 * Send an invitation email with a magic link to a newly created user.
 * Called from the inviteUser mutation.
 */
export async function sendInvitationEmail(
  email: string,
  inviterName: string
) {
  // Use better-auth's magic link API to generate and send the link.
  // The sendMagicLink callback above handles the actual email delivery.
  // We call the server-side API directly.
  try {
    // Flag this email as an invitation so the sendMagicLink callback
    // uses the invitation template instead of the regular sign-in one.
    pendingInvitations.set(email, inviterName);

    const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:4000";
    // APP_URL is the frontend origin (different from API in dev, same in production)
    const appURL = process.env.APP_URL || baseURL;
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: appURL,
        errorCallbackURL: `${appURL}/login`,
      },
      headers: new Headers({
        origin: baseURL,
      }),
    });
    console.log(`[auth] Invitation magic link sent to ${email}`);
  } catch (err) {
    pendingInvitations.delete(email);
    console.error(`[auth] Failed to send invitation to ${email}:`, err);
    throw err;
  }
}

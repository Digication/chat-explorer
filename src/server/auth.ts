import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import sgMail from "@sendgrid/mail";
import pg from "pg";

// Configure SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@digication.com";

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
      disableSignUp: true, // Only pre-created (invited) users can sign in
    },
  },
  plugins: [
    magicLink({
      disableSignUp: true, // Only existing users can request magic links
      sendMagicLink: async ({ email, url }) => {
        if (!process.env.SENDGRID_API_KEY) {
          // Dev mode — log the magic link to console
          console.log(`[magic-link] Link for ${email}: ${url}`);
          return;
        }

        await sgMail.send({
          to: email,
          from: FROM_EMAIL,
          subject: "Sign in to Chat Explorer",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #333;">Chat Explorer</h2>
              <p>Click the button below to sign in. This link expires in 5 minutes.</p>
              <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1976d2; color: #fff; text-decoration: none; border-radius: 4px; margin: 20px 0;">
                Sign in
              </a>
              <p style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
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
    "https://chat-explorer.localhost",
  ],
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
    subject: `[Chat Explorer] Sign-in attempt from uninvited user`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #333;">Uninvited Sign-in Attempt</h2>
        <p>Someone tried to sign in to Chat Explorer but doesn't have an account:</p>
        <ul>
          <li><strong>Name:</strong> ${name}</li>
          <li><strong>Email:</strong> ${email}</li>
        </ul>
        <p>If you'd like to invite this person, go to the Admin Console and use "Invite User."</p>
      </div>
    `,
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
    await auth.api.signInMagicLink({
      body: { email },
      headers: new Headers(),
    });
    console.log(`[auth] Invitation magic link sent to ${email}`);
  } catch (err) {
    console.error(`[auth] Failed to send invitation to ${email}:`, err);
    throw err;
  }
}

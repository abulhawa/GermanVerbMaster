import { createHmac, randomUUID } from "node:crypto";
import { Router, type Request, type Response as ExpressResponse } from "express";

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const MICROSOFT_USERINFO_URL = "https://graph.microsoft.com/oidc/userinfo";

type MicrosoftTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
};

type MicrosoftUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export type NormalizedMicrosoftUser = {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * Helper to construct the Microsoft OAuth authorization URL.
 * Includes the required OAuth parameters using the .env-backed values.
 */
export function buildMicrosoftAuthURL(state = randomUUID()): string {
  const { MICROSOFT_CLIENT_ID, MICROSOFT_REDIRECT_URI } = getRequiredMicrosoftEnv();

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    redirect_uri: MICROSOFT_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    response_mode: "query",
    state,
  });

  return `${MICROSOFT_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access and ID tokens.
 */
export async function exchangeCodeForToken(code: string): Promise<MicrosoftTokenResponse> {
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI } = getRequiredMicrosoftEnv();

  const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      redirect_uri: MICROSOFT_REDIRECT_URI,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!tokenResponse.ok) {
    const errorPayload = await safeJson(tokenResponse);
    const errorMessage =
      errorPayload?.error_description || errorPayload?.error || `Token exchange failed with ${tokenResponse.status}`;
    throw new Error(errorMessage);
  }

  return (await tokenResponse.json()) as MicrosoftTokenResponse;
}

/**
 * Fetch the authenticated user's profile from the OpenID userinfo endpoint.
 */
export async function fetchMicrosoftUser(accessToken: string): Promise<MicrosoftUserInfo> {
  const userResponse = await fetch(MICROSOFT_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userResponse.ok) {
    const errorPayload = await safeJson(userResponse);
    const errorMessage =
      errorPayload?.error_description || errorPayload?.error || `Userinfo request failed with ${userResponse.status}`;
    throw new Error(errorMessage);
  }

  return (await userResponse.json()) as MicrosoftUserInfo;
}

function normalizeMicrosoftUser(user: MicrosoftUserInfo): NormalizedMicrosoftUser {
  return {
    id: user.sub,
    email: user.email ?? null,
    name: user.name ?? null,
    picture: user.picture ?? null,
  };
}

function createSessionToken(user: NormalizedMicrosoftUser): string {
  // Simple HMAC-signed JWT-style token to illustrate session creation.
  // Replace with your preferred session store, JWT library, or cookie-based auth.
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, name: user.name, exp })).toString(
    "base64url",
  );
  const secret = process.env.SESSION_SECRET || "change-me";
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function getRequiredMicrosoftEnv(): {
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_REDIRECT_URI: string;
} {
  const {
    MICROSOFT_CLIENT_ID = "",
    MICROSOFT_CLIENT_SECRET = "",
    MICROSOFT_REDIRECT_URI = "",
  } = process.env;

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REDIRECT_URI) {
    throw new Error("MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI must be set");
  }

  return { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI };
}

async function safeJson(response: globalThis.Response): Promise<any | null> {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

/**
 * Router that wires up the Microsoft OAuth 2.0 flow.
 *
 * Routes:
 * - GET /auth/microsoft           – redirects to Microsoft's consent screen
 * - GET /auth/microsoft/callback  – handles the OAuth callback, fetches userinfo, and issues a session token
 *
 * Frontend usage:
 * ```html
 * <button onclick="window.location.href='/auth/microsoft'">Sign in with Microsoft</button>
 * ```
 */
export function createMicrosoftOAuthRouter(): Router {
  const router = Router();

  router.get("/auth/microsoft", (_req: Request, res: ExpressResponse) => {
    // Redirect the browser to Microsoft's hosted login page.
    const authorizationURL = buildMicrosoftAuthURL();
    return res.redirect(authorizationURL);
  });

  router.get("/auth/microsoft/callback", async (req: Request, res: ExpressResponse) => {
    const { code, error, error_description: errorDescription } = req.query;

    if (typeof error === "string") {
      return res.status(400).json({ error, errorDescription });
    }

    if (typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    // Swap the short-lived code for tokens, then fetch the user's profile.
    const tokenSet = await exchangeCodeForToken(code);
    const microsoftUser = await fetchMicrosoftUser(tokenSet.access_token);
    const normalizedUser = normalizeMicrosoftUser(microsoftUser);

    // Illustrate session creation; in a real app you would persist the session and/or set a secure cookie instead.
    const sessionToken = createSessionToken(normalizedUser);

    return res.json({
      user: normalizedUser,
      sessionToken,
      tokens: tokenSet,
      microsoftUser,
    });
  });

  return router;
}

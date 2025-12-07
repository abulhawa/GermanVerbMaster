import { Buffer } from "node:buffer";
import { Router, type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { betterAuth, type Auth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { google, microsoft, type SocialProviders } from "better-auth/social-providers";
import { db, authAccounts, authSessions, authUsers, authVerifications, userRoleEnum } from "@db";
import { sendPasswordResetEmail as deliverPasswordResetEmail, sendVerificationEmail as deliverVerificationEmail } from "./emails.js";

const BASE_PATH = "/api/auth";
const baseURL = new URL(BASE_PATH, resolveBaseURL()).toString();

const socialProviders = buildSocialProviders(baseURL);

const auth = betterAuth({
  baseURL,
  basePath: BASE_PATH,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUsers,
      account: authAccounts,
      session: authSessions,
      verification: authVerifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    async sendResetPassword({
      user,
      url,
      token,
    }: {
      user: { email: string; name?: string | null };
      url: string;
      token: string;
    }) {
      await deliverPasswordResetEmail(user.email, {
        url,
        token,
        name: user.name ?? undefined,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    async sendVerificationEmail({
      user,
      url,
      token,
    }: {
      user: { email: string; name?: string | null };
      url: string;
      token: string;
    }) {
      await deliverVerificationEmail(user.email, {
        url,
        token,
        name: user.name ?? undefined,
      });
    },
  },
  socialProviders,
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: userRoleEnum.enumValues[0],
        input: false,
      },
    },
  },
});

type SessionPayload = Awaited<ReturnType<(typeof auth)["api"]["getSession"]>> extends infer Result
  ? Result extends { session: infer S; user: infer U }
    ? { session: S; user: U }
    : Result extends { response: { session: infer S; user: infer U } }
      ? { session: S; user: U }
      : never
  : never;

export type AuthSession = SessionPayload;

declare global {
  namespace Express {
    interface Request {
      authSession?: AuthSession | null;
    }
  }
}

export const authRouter = createBetterAuthRouter(auth);

export async function getSessionFromRequest(req: ExpressRequest, res?: ExpressResponse): Promise<AuthSession | null> {
  const request = createBetterAuthRequest(req, baseURL);
  const result = (await auth.api.getSession({
    request,
    headers: request.headers,
    returnHeaders: true,
  })) as
    | { headers: Headers; response: SessionPayload | null }
    | SessionPayload
    | null;

  if (!result) {
    return null;
  }

  const payload = "response" in result ? result.response : result;

  if (!payload || !payload.session) {
    return null;
  }

  if ("headers" in result && res) {
    applyHeadersToExpressResponse(res, result.headers);
  }

  return payload;
}

export function requireSession(options: { requireAdmin?: boolean } = {}) {
  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const session = await getSessionFromRequest(req, res);
      if (!session) {
        return res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHENTICATED",
        });
      }

      const userRole = (session.user as Record<string, unknown>)?.role;
      if (options.requireAdmin && userRole !== "admin") {
        return res.status(403).json({
          error: "Admin privileges required",
          code: "FORBIDDEN",
        });
      }

      req.authSession = session;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireAdmin() {
  return requireSession({ requireAdmin: true });
}

type FetchRequest = globalThis.Request;
type FetchResponse = globalThis.Response;

function createBetterAuthRouter(instance: Auth): Router {
  const router = Router();

  router.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const request = createBetterAuthRequest(req, baseURL);
      const response = await instance.handler(request);
      await forwardResponse(res, response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function createBetterAuthRequest(req: ExpressRequest, origin: string): FetchRequest {
  const url = new URL(req.originalUrl ?? req.url, origin);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);

  let body: BodyInit | undefined;
  if (hasBody) {
    if (Buffer.isBuffer(req.body)) {
      body = req.body as unknown as BodyInit;
    } else if (typeof req.body === "string") {
      body = req.body;
    } else if (req.is?.("application/json")) {
      body = JSON.stringify(req.body ?? {});
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    } else if (req.is?.("application/x-www-form-urlencoded")) {
      body = new URLSearchParams(req.body ?? {}).toString();
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/x-www-form-urlencoded");
      }
    } else if (req.body !== undefined && req.body !== null) {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new globalThis.Request(url.toString(), {
    method,
    headers,
    body: body as BodyInit | null | undefined,
    redirect: "manual",
  });
}

async function forwardResponse(res: ExpressResponse, response: FetchResponse): Promise<void> {
  applyHeadersToExpressResponse(res, response.headers);

  res.status(response.status);

  if (!response.body || [204, 205, 304].includes(response.status)) {
    res.end();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    res.end();
    return;
  }

  res.send(buffer);
}

function applyHeadersToExpressResponse(res: ExpressResponse, headers: Headers): void {
  const setCookieValues = getSetCookie(headers);
  if (setCookieValues.length > 0) {
    res.setHeader("Set-Cookie", setCookieValues);
  }

  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
}

function getSetCookie(headers: Headers): string[] {
  const candidate = (headers as unknown as { getSetCookie?: () => string[] | undefined }).getSetCookie?.();
  if (candidate?.length) {
    return candidate;
  }

  const values: string[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      values.push(value);
    }
  });
  return values;
}

function buildSocialProviders(origin: string): SocialProviders {
  const providers: SocialProviders = {};

  const googleClientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.BETTER_AUTH_GOOGLE_CLIENT_ID ||
    process.env.AUTH_GOOGLE_CLIENT_ID;
  const googleClientSecret =
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET ||
    process.env.AUTH_GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    providers.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      redirectURI: new URL(`${BASE_PATH}/callback/google`, origin).toString(),
      scope: ["openid", "profile", "email"],
      enabled: true,
    };
  } else {
    console.warn("Google OAuth credentials are missing; Google sign-in is disabled.");
  }

  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    providers.microsoft = {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      redirectURI: new URL(`${BASE_PATH}/callback/microsoft`, origin).toString(),
      scope: ["openid", "profile", "email"],
      enabled: true,
    };
  }

  return providers;
}

function resolveBaseURL(): string {
  const explicit = process.env.BETTER_AUTH_URL;
  if (explicit) return explicit;

  const fromAppOrigin = process.env.APP_ORIGIN?.split(",").map((value) => value.trim()).filter(Boolean)?.[0];
  if (fromAppOrigin) return fromAppOrigin;

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }

  return "http://localhost:5000";
}

function getEnabledSocialProviderKeys(): string[] {
  return Object.entries(socialProviders as Record<string, { enabled?: boolean }>)
    .filter(([, provider]) => provider && provider.enabled !== false)
    .map(([key]) => key);
}

export { auth, getEnabledSocialProviderKeys, socialProviders };

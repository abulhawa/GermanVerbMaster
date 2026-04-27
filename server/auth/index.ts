import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createClient, type User } from "@supabase/supabase-js";

export interface AuthSession {
  session: {
    id: string;
    expiresAt: Date | null;
    accessToken: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    emailVerified: boolean;
    role: string;
    createdAt: string | null;
    updatedAt: string | null;
  };
}

declare global {
  namespace Express {
    interface Request {
      authSession?: AuthSession | null;
    }
  }
}

let cachedSupabase: ReturnType<typeof createClient> | null = null;

function getSupabaseServerClient() {
  if (cachedSupabase) {
    return cachedSupabase;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  cachedSupabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedSupabase;
}

function extractBearerToken(req: ExpressRequest): string | null {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

function mapUser(user: User, token: string): AuthSession {
  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};
  const name =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;
  const image =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : null;
  const role = typeof appMetadata.role === "string" ? appMetadata.role : "standard";

  return {
    session: {
      id: user.id,
      expiresAt: null,
      accessToken: token,
    },
    user: {
      id: user.id,
      name,
      email: user.email ?? null,
      image,
      emailVerified: Boolean(user.email_confirmed_at),
      role,
      createdAt: user.created_at ?? null,
      updatedAt: user.updated_at ?? null,
    },
  };
}

export async function getSessionFromRequest(req: ExpressRequest): Promise<AuthSession | null> {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return mapUser(data.user, token);
}

export function requireSession(options: { requireAdmin?: boolean } = {}) {
  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        return res.status(401).json({
          error: "Authentication required",
          code: "UNAUTHENTICATED",
        });
      }

      if (options.requireAdmin && session.user.role !== "admin") {
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

export function getEnabledSocialProviderKeys(): string[] {
  return getSupabaseServerClient() ? ["google"] : [];
}

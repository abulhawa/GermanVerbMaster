import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  emailVerified: boolean;
  role: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SessionInfo {
  id: string | null;
  expiresAt: string | null;
}

export interface SessionResponse {
  session: SessionInfo;
  user: SessionUser;
}

export type AuthSessionState = SessionResponse | null;

const SESSION_QUERY_KEY = ["auth", "session"] as const;

interface EmailCredentials {
  email: string;
  password: string;
  name?: string;
}

interface EmailPayload {
  email: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      try {
        const payload = (await response.json()) as Record<string, unknown>;
        const message =
          (typeof payload.error === "string" && payload.error.trim()) ||
          (typeof payload.message === "string" && payload.message.trim()) ||
          (typeof payload.code === "string" && payload.code.trim()) ||
          null;
        if (message) {
          throw new Error(message);
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }

    throw new Error(response.statusText || "Request failed");
  }

  if (!isJson || response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function fetchSession(): Promise<AuthSessionState> {
  try {
    const response = await fetch("/api/me", {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json",
      },
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const error = await safeParseError(response);
      throw new Error(error ?? response.statusText ?? "Failed to load session");
    }

    return (await response.json()) as SessionResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw error instanceof Error ? error : new Error("Failed to load session");
  }
}

async function safeParseError(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return null;
  }

  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const fields = [payload.error, payload.message, payload.code];
    for (const field of fields) {
      if (isNonEmptyString(field)) {
        return field;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function signInWithEmail(credentials: EmailCredentials): Promise<void> {
  await requestJson<unknown>("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
}

async function signUpWithEmail(credentials: EmailCredentials): Promise<void> {
  await requestJson<unknown>("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
      name: credentials.name,
    }),
  });
}

async function signOutRequest(): Promise<void> {
  await requestJson<unknown>("/api/auth/sign-out", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function resendVerificationEmailRequest(email: string): Promise<void> {
  await requestJson<unknown>("/api/auth/send-verification-email", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

async function requestPasswordResetEmail(email: string): Promise<void> {
  await requestJson<unknown>("/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function useAuthSession() {
  return useQuery<AuthSessionState, Error>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useSignInMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, EmailCredentials>({
    mutationFn: signInWithEmail,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useSignUpMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, EmailCredentials>({
    mutationFn: signUpWithEmail,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useSignOutMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: signOutRequest,
    onSuccess: async () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null satisfies AuthSessionState);
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useResendVerificationEmailMutation() {
  return useMutation<void, Error, EmailPayload>({
    mutationFn: async ({ email }) => {
      await resendVerificationEmailRequest(email);
    },
  });
}

export function useRequestPasswordResetMutation() {
  return useMutation<void, Error, EmailPayload>({
    mutationFn: async ({ email }) => {
      await requestPasswordResetEmail(email);
    },
  });
}

export function getRoleFromSession(session: AuthSessionState): string | null {
  return session?.user.role ?? null;
}

export const sessionQueryKey = SESSION_QUERY_KEY;

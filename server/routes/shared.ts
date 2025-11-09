import type { Response } from "express";
import { z } from "zod";
import type { AuthSession } from "../auth/index.js";
import type { CEFRLevel } from "@shared";

export const levelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const UNSPECIFIED_CEFR_LEVEL = "__";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

export function normaliseExampleRecord(
  example: unknown,
):
  | {
      de: string | null;
      en: string | null;
    }
  | undefined {
  if (!isRecord(example)) {
    return undefined;
  }

  const de = normaliseString(example.de);
  const english = normaliseString(example.en);

  if (!de && !english) {
    return undefined;
  }

  return {
    de: de ?? null,
    en: english ?? null,
  };
}

export function normaliseLexemeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const base: Record<string, unknown> = { ...metadata };
  const rawExample = isRecord(base.example) ? base.example : null;

  if (rawExample) {
    const example = normaliseExampleRecord(rawExample);
    if (example) {
      base.example = example;
    } else {
      delete base.example;
    }
  }

  return base;
}

export function normaliseCefrLevel(value: unknown): CEFRLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const upper = value.toUpperCase();
  return LEVEL_ORDER.includes(upper as (typeof LEVEL_ORDER)[number]) ? (upper as CEFRLevel) : undefined;
}

export function normaliseString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normaliseStringOrNull(value: unknown): string | null {
  return normaliseString(value) ?? null;
}

export function serialisePracticeLogLevel(level: CEFRLevel | null | undefined): string {
  return level ?? UNSPECIFIED_CEFR_LEVEL;
}

export function normalisePracticeLogLevel(value: string | null | undefined): CEFRLevel | null {
  if (!value || value === UNSPECIFIED_CEFR_LEVEL) {
    return null;
  }
  return normaliseCefrLevel(value) ?? null;
}

export function getSessionUser(session: AuthSession | null | undefined): Record<string, unknown> | null {
  if (!session?.user || typeof session.user !== "object") {
    return null;
  }
  return session.user as Record<string, unknown>;
}

export function getSessionUserId(session: AuthSession | null | undefined): string | null {
  const user = getSessionUser(session);
  const id = user?.id;
  if (typeof id === "string") {
    const trimmed = id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof id === "number") {
    return Number.isFinite(id) ? String(id) : null;
  }

  return null;
}

export function getSessionRole(session: AuthSession | null | undefined): string | null {
  const user = getSessionUser(session);
  const role = user?.role;
  return typeof role === "string" ? role : null;
}

export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function normalizeStringParam(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return undefined;
}

export function sendError(res: Response, status: number, message: string, code?: string) {
  if (code) {
    return res.status(status).json({ error: message, code });
  }
  return res.status(status).json({ error: message });
}

export function normaliseAuxiliaryValue(aux: string | null | undefined): "haben" | "sein" | "haben / sein" {
  if (!aux) {
    return "haben";
  }
  const trimmed = aux.trim().toLowerCase();
  if (trimmed === "sein") {
    return "sein";
  }
  if (trimmed.replace(/\s+/g, "") === "haben/sein") {
    return "haben / sein";
  }
  return "haben";
}

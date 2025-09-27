import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import type { CEFRLevel, GermanVerb } from "@shared";

interface CefrCsvRow {
  level?: string;
  infinitive?: string;
  source_id?: string;
  source_name?: string;
  source_url?: string;
  license?: string;
  notes?: string;
}

export type CefrVerbMap = Partial<Record<CEFRLevel, GermanVerb[]>>;

export function loadCefrVerbPlaceholdersByLevel(
  levels: ReadonlyArray<CEFRLevel>,
  existingInfinitives: Iterable<string> = []
): CefrVerbMap {
  const allowedLevels = new Set(levels);
  const seenInfinitives = new Set<string>(
    Array.from(existingInfinitives, value => value.toLowerCase())
  );
  const supplementalVerbs: CefrVerbMap = {};

  const csvContent = tryReadCsv();
  if (!csvContent) {
    return supplementalVerbs;
  }

  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as CefrCsvRow[];

  for (const row of rows) {
    const rawLevel = row.level?.toUpperCase();
    if (!rawLevel || !isCefrLevel(rawLevel) || !allowedLevels.has(rawLevel)) {
      continue;
    }

    const infinitive = row.infinitive?.trim();
    if (!infinitive) {
      continue;
    }

    const normalizedInfinitive = infinitive.toLowerCase();
    if (seenInfinitives.has(normalizedInfinitive)) {
      continue;
    }

    seenInfinitives.add(normalizedInfinitive);

    const verb: GermanVerb = {
      infinitive,
      english: "",
      präteritum: "",
      partizipII: "",
      auxiliary: "haben",
      level: rawLevel,
      präteritumExample: "",
      partizipIIExample: "",
      source: {
        name: row.source_name?.trim() || "CEFR",
        levelReference: buildLevelReference(rawLevel, row)
      },
      pattern: null
    };

    const levelVerbs = supplementalVerbs[rawLevel] ?? [];
    levelVerbs.push(verb);
    supplementalVerbs[rawLevel] = levelVerbs;
  }

  return supplementalVerbs;
}

function tryReadCsv(): string | undefined {
  try {
    const csvUrl = new URL("../docs/verb-corpus/cefr-verb-shortlist.csv", import.meta.url);
    const csvPath = fileURLToPath(csvUrl);
    return readFileSync(csvPath, "utf8");
  } catch (error) {
    console.warn(
      "Unable to read CEFR verb shortlist CSV. Skipping supplemental verb import.",
      error
    );
    return undefined;
  }
}

function buildLevelReference(level: CEFRLevel, row: CefrCsvRow): string {
  const parts: string[] = [];
  const sourceId = row.source_id?.trim();
  if (sourceId) {
    parts.push(sourceId);
  } else {
    parts.push(`${level} Verb Shortlist`);
  }

  const notes = row.notes?.trim();
  if (notes) {
    parts.push(notes);
  }

  const sourceUrl = row.source_url?.trim();
  if (sourceUrl) {
    parts.push(sourceUrl);
  }

  const license = row.license?.trim();
  if (license) {
    parts.push(`License: ${license}`);
  }

  return parts.join(" | ");
}

function isCefrLevel(value: string): value is CEFRLevel {
  return value === "A1" || value === "A2" || value === "B1" || value === "B2" || value === "C1" || value === "C2";
}

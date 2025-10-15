export const EXPORT_SCHEMA_VERSION = "1.0.0" as const;

export type ExportOperation = "upsert" | "delete";

export interface ExportExample {
  sentence: Record<string, string>;
  translations: Record<string, string>;
  approved: boolean;
}

export interface ExportWordPayload {
  schema: typeof EXPORT_SCHEMA_VERSION;
  wordId: string;
  lemma: string;
  pos: string;
  level: string | null;
  approved: boolean;
  complete: boolean;
  lastUpdated: string;
  forms: Record<string, unknown>;
  translations: Record<string, string>;
  examples: ExportExample[];
  op?: ExportOperation;
}

export interface ExportManifestEntry {
  pos: string;
  snapshot: string | null;
  updates: string | null;
  snapshotGeneratedAt: string | null;
  lastUpdateAt: string | null;
}

export interface ExportManifest {
  schema: typeof EXPORT_SCHEMA_VERSION;
  version: string;
  generatedAt: string;
  entries: Record<string, ExportManifestEntry>;
}

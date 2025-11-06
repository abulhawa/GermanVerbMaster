import type {
  BulkEnrichmentResponse,
  EnrichmentPatch,
  WordEnrichmentPreview,
} from '@shared/enrichment';

export interface RunEnrichmentPayload {
  limit?: number;
  mode?: 'pending' | 'approved' | 'all';
  onlyIncomplete?: boolean;
  enableAi?: boolean;
  allowOverwrite?: boolean;
  collectSynonyms?: boolean;
  collectExamples?: boolean;
  collectTranslations?: boolean;
  collectWiktextract?: boolean;
}

export interface WordEnrichmentOptions {
  enableAi?: boolean;
  allowOverwrite?: boolean;
  collectSynonyms?: boolean;
  collectExamples?: boolean;
  collectTranslations?: boolean;
  collectWiktextract?: boolean;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => 'Request failed');
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function runBulkEnrichment(
  payload: RunEnrichmentPayload,
): Promise<BulkEnrichmentResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const response = await fetch('/api/enrichment/run', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  return handleResponse<BulkEnrichmentResponse>(response);
}

export async function previewWordEnrichment(
  wordId: number,
  options: WordEnrichmentOptions,
): Promise<WordEnrichmentPreview> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const response = await fetch(`/api/enrichment/words/${wordId}/preview`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  });

  return handleResponse<WordEnrichmentPreview>(response);
}

export interface ApplyEnrichmentResponse {
  word: unknown;
  appliedFields: string[];
  draftId?: number;
}

export async function applyWordEnrichment(
  wordId: number,
  patch: EnrichmentPatch,
  draftId?: number,
): Promise<ApplyEnrichmentResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const response = await fetch(`/api/enrichment/words/${wordId}/apply`, {
    method: 'POST',
    headers,
    body: JSON.stringify(
      typeof draftId === 'number' ? { patch, draftId } : { patch },
    ),
  });

  return handleResponse<ApplyEnrichmentResponse>(response);
}

import type { SupabaseStorageListResponse, SupabaseStorageCleanExportResponse } from '@shared/enrichment';

interface FetchStorageOptions {
  limit?: number;
  offset?: number;
  path?: string | null;
  adminToken?: string;
}

function buildHeaders(adminToken?: string, includeJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (adminToken?.trim()) {
    headers['x-admin-token'] = adminToken.trim();
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => 'Request failed');
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchEnrichmentStorage(
  options: FetchStorageOptions = {},
): Promise<SupabaseStorageListResponse> {
  const params = new URLSearchParams();
  if (options.limit && Number.isFinite(options.limit)) {
    params.set('limit', String(options.limit));
  }
  if (options.offset && Number.isFinite(options.offset) && (options.offset ?? 0) > 0) {
    params.set('offset', String(options.offset));
  }
  if (options.path && options.path.trim().length > 0) {
    params.set('path', options.path.trim());
  }

  const query = params.toString();
  const response = await fetch(`/api/enrichment/storage${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: buildHeaders(options.adminToken),
  });

  return handleResponse<SupabaseStorageListResponse>(response);
}

export async function cleanAndExportEnrichmentStorage(
  adminToken?: string,
): Promise<SupabaseStorageCleanExportResponse> {
  const response = await fetch('/api/enrichment/storage/clean-export', {
    method: 'POST',
    headers: buildHeaders(adminToken, true),
    body: JSON.stringify({}),
  });

  return handleResponse<SupabaseStorageCleanExportResponse>(response);
}

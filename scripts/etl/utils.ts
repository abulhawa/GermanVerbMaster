import { createHash } from 'node:crypto';

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',')}}`;
}

export function sha1(payload: string): string {
  return createHash('sha1').update(payload).digest('hex');
}

export function chunkArray<T>(values: readonly T[], size: number): T[][] {
  if (size <= 0) {
    return [Array.from(values)];
  }

  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

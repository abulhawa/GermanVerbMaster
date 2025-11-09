import { createHash } from 'node:crypto';

import { logStructured } from '../../logger.js';

export const TASK_SYNC_PROFILING_ENABLED = process.env.DEBUG_TASK_SYNC_PROFILING === '1';
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 250;

export interface ChunkRetryOptions {
  operation: string;
  attempts?: number;
  delayMs?: number;
}

export async function processChunksWithRetry<T>(
  chunks: T[][],
  handler: (chunk: T[]) => Promise<void>,
  options: ChunkRetryOptions,
): Promise<void> {
  const attempts = Math.max(options.attempts ?? DEFAULT_RETRY_ATTEMPTS, 1);
  const delayMs = Math.max(options.delayMs ?? DEFAULT_RETRY_DELAY_MS, 0);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    let attempt = 0;

    while (attempt < attempts) {
      try {
        await handler(chunk);
        break;
      } catch (error) {
        attempt += 1;
        if (attempt >= attempts) {
          throw error;
        }

        logStructured({
          source: 'task-sync',
          level: 'warn',
          event: `${options.operation}.retry`,
          message: `Retrying chunk ${index + 1}/${chunks.length}`,
          data: {
            attempt,
            attempts,
            chunkSize: chunk.length,
          },
          error,
        });

        if (delayMs > 0) {
          await sleep(delayMs * attempt);
        }
      }
    }
  }
}

export function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

export function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function computeSyncVersionHash(
  lexemeRows: Array<{ id: string; updatedAt: Date | null }>,
  inflectionRows: Array<{ id: string; lexemeId: string; updatedAt: Date | null }>,
): string | null {
  const tokens: string[] = [];

  for (const row of lexemeRows) {
    if (!row.id) {
      continue;
    }

    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0;
    tokens.push(`lexeme:${row.id}:${updatedAt}`);
  }

  for (const row of inflectionRows) {
    if (!row.id) {
      continue;
    }

    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0;
    tokens.push(`inflection:${row.lexemeId}:${row.id}:${updatedAt}`);
  }

  if (tokens.length === 0) {
    return null;
  }

  tokens.sort();
  const hash = createHash('sha1');
  for (const token of tokens) {
    hash.update(token);
    hash.update('\n');
  }

  return hash.digest('hex');
}

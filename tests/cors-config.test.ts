import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Express } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveAllowedOrigins } from '../server/config/cors.js';
import { createApiApp } from '../server/api/app.js';

vi.mock('../server/routes.js', () => ({
  registerRoutes(app: Express) {
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
  },
}));

async function listen(server: ReturnType<typeof createServer>): Promise<AddressInfo> {
  return await new Promise<AddressInfo>((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine server address'));
        return;
      }
      resolve(address);
    });
    server.on('error', reject);
  });
}

describe('resolveAllowedOrigins', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppOrigin = process.env.APP_ORIGIN;

  beforeEach(() => {
    delete process.env.APP_ORIGIN;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalAppOrigin === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = originalAppOrigin;
    }
  });

  it('returns explicitly provided origins', () => {
    const allowed = resolveAllowedOrigins({ explicitOrigins: [' https://example.com ', 'https://example.com'] });
    expect(allowed).toEqual(['https://example.com']);
  });

  it('parses APP_ORIGIN when explicit origins are not provided', () => {
    process.env.APP_ORIGIN = 'https://one.example.com, https://two.example.com';
    const allowed = resolveAllowedOrigins({ envOrigins: process.env.APP_ORIGIN });
    expect(allowed).toEqual(['https://one.example.com', 'https://two.example.com']);
  });

  it('throws in production when no allow list is configured', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveAllowedOrigins()).toThrowError(
      'APP_ORIGIN must be configured with at least one allowed origin when NODE_ENV is set to production.',
    );
  });

  it('falls back to localhost origins outside production', () => {
    const allowed = resolveAllowedOrigins();
    expect(allowed).toEqual([
      'http://127.0.0.1:4173',
      'http://localhost:4173',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5000',
      'http://localhost:5000',
    ]);
  });
});

describe('CORS middleware', () => {
  it('rejects requests from origins that are not on the allow list', async () => {
    const app = createApiApp({ allowedOrigins: ['https://allowed.example.com'] });
    const server = createServer(app);
    const { port } = await listen(server);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Origin: 'https://blocked.example.com' },
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Not allowed by CORS' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  });
});

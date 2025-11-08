import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/routes.js', () => ({
  registerRoutes(app: Express) {
    app.get('/api/error', () => {
      throw new Error('Boom');
    });
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
  },
}));

import { createApiApp } from '../server/api/app.js';
import * as logger from '../server/logger.js';

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

describe('API error handling', () => {
  it('swallows handler errors without crashing the server', async () => {
    const logErrorSpy = vi.spyOn(logger, 'logError').mockImplementation(() => {});

    const app = createApiApp({ enableCors: false });

    const server = createServer(app);
    const { port } = await listen(server);

    try {
      const errorResponse = await fetch(`http://127.0.0.1:${port}/api/error`);
      expect(errorResponse.status).toBe(500);
      expect(await errorResponse.json()).toEqual({ error: 'Boom' });

      const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthResponse.status).toBe(200);
      expect(await healthResponse.json()).toEqual({ status: 'ok' });

      expect(logErrorSpy).toHaveBeenCalledTimes(1);
      expect(logErrorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
    } finally {
      logErrorSpy.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
          } else {
            resolve();
          }
        });
      });
    }
  });
});

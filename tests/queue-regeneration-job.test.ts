import express from 'express';
import { createServer, type Server } from 'http';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

const srsEngineMock = vi.hoisted(() => ({
  regenerateQueuesOnce: vi.fn(),
  isEnabled: vi.fn(() => true),
}));

vi.mock('../server/srs', () => ({
  srsEngine: {
    isEnabled: (...args: Parameters<typeof srsEngineMock.isEnabled>) =>
      srsEngineMock.isEnabled(...args),
    regenerateQueuesOnce: (...args: Parameters<typeof srsEngineMock.regenerateQueuesOnce>) =>
      srsEngineMock.regenerateQueuesOnce(...args),
    recordPracticeAttempt: vi.fn(),
    fetchQueueForDevice: vi.fn(),
    generateQueueForDevice: vi.fn(),
    isQueueStale: vi.fn(),
  },
}));

describe('POST /api/jobs/regenerate-queues', () => {
  let app: express.Express;
  let server: Server;
  let dbContext: TestDatabaseContext | undefined;
  let registerRoutes: typeof import('../server/routes').registerRoutes;

  beforeEach(async () => {
    vi.clearAllMocks();
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();

    ({ registerRoutes } = await import('../server/routes'));

    srsEngineMock.isEnabled.mockReset();
    srsEngineMock.regenerateQueuesOnce.mockReset();
    srsEngineMock.isEnabled.mockReturnValue(true);
    srsEngineMock.regenerateQueuesOnce.mockResolvedValue(undefined);

    app = express();
    registerRoutes(app);
    server = createServer(app);
  });

  afterEach(async () => {
    server.close();
    server = undefined as unknown as Server;

    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('returns disabled status when the feature flag is off', async () => {
    srsEngineMock.isEnabled.mockReturnValue(false);

    const response = await request(app).post('/api/jobs/regenerate-queues');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'disabled' });
    expect(srsEngineMock.regenerateQueuesOnce).not.toHaveBeenCalled();
  });

  it('triggers a regeneration pass when enabled', async () => {
    const response = await request(app).post('/api/jobs/regenerate-queues');

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: 'queued' });
    expect(srsEngineMock.regenerateQueuesOnce).toHaveBeenCalledTimes(1);
  });

  it('surfaces failures from the regeneration helper', async () => {
    const error = new Error('db offline');
    srsEngineMock.regenerateQueuesOnce.mockRejectedValueOnce(error);

    const response = await request(app).post('/api/jobs/regenerate-queues');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: 'QUEUE_REGENERATION_FAILED' });
    expect(srsEngineMock.regenerateQueuesOnce).toHaveBeenCalledTimes(1);
  });
});

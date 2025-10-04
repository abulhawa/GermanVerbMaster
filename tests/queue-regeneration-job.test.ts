import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';
import { createApiInvoker } from './helpers/vercel';

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
  let invokeApi: ReturnType<typeof createApiInvoker>;
  let createVercelApiHandler: typeof import('../server/api/vercel-handler').createVercelApiHandler;
  let dbContext: TestDatabaseContext | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();

    srsEngineMock.isEnabled.mockReset();
    srsEngineMock.regenerateQueuesOnce.mockReset();
    srsEngineMock.isEnabled.mockReturnValue(true);
    srsEngineMock.regenerateQueuesOnce.mockResolvedValue(undefined);

    ({ createVercelApiHandler } = await import('../server/api/vercel-handler'));
    const handler = createVercelApiHandler({ enableCors: false });
    invokeApi = createApiInvoker(handler);
  });

  afterEach(async () => {
    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('returns disabled status when the feature flag is off', async () => {
    srsEngineMock.isEnabled.mockReturnValue(false);

    const response = await invokeApi('/api/jobs/regenerate-queues', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(response.bodyJson).toEqual({ status: 'disabled' });
    expect(srsEngineMock.regenerateQueuesOnce).not.toHaveBeenCalled();
  });

  it('triggers a regeneration pass when enabled', async () => {
    const response = await invokeApi('/api/jobs/regenerate-queues', { method: 'POST' });

    expect(response.status).toBe(202);
    expect(response.bodyJson).toEqual({ status: 'queued' });
    expect(srsEngineMock.regenerateQueuesOnce).toHaveBeenCalledTimes(1);
  });

  it('surfaces failures from the regeneration helper', async () => {
    const error = new Error('db offline');
    srsEngineMock.regenerateQueuesOnce.mockRejectedValueOnce(error);

    const response = await invokeApi('/api/jobs/regenerate-queues', { method: 'POST' });

    expect(response.status).toBe(500);
    expect(response.bodyJson).toMatchObject({ code: 'QUEUE_REGENERATION_FAILED' });
    expect(srsEngineMock.regenerateQueuesOnce).toHaveBeenCalledTimes(1);
  });
});

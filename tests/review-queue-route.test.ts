import express from 'express';
import { createServer, type Server } from 'http';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdaptiveQueueItem } from '@shared';
import { setupTestDatabase, type TestDatabaseContext } from './helpers/pg';

const srsEngineMock = vi.hoisted(() => ({
  regenerateQueuesOnce: vi.fn(),
  recordPracticeAttempt: vi.fn(),
  fetchQueueForDevice: vi.fn(),
  generateQueueForDevice: vi.fn(),
  isEnabled: vi.fn(() => false),
  isQueueStale: vi.fn(() => false),
}));

const shadowModeMock = vi.hoisted(() => ({
  runVerbQueueShadowComparison: vi.fn(() => Promise.resolve()),
}));

const configMock = vi.hoisted(() => ({
  isLexemeSchemaEnabled: vi.fn(() => true),
}));

vi.mock('../server/srs', () => ({
  srsEngine: srsEngineMock,
}));

vi.mock('../server/tasks/shadow-mode', () => shadowModeMock);
vi.mock('../server/config', () => configMock);

describe('GET /api/review-queue', () => {
  let registerRoutes: typeof import('../server/routes').registerRoutes;
  let dbContext: TestDatabaseContext | undefined;
  let server: Server | undefined;

  beforeEach(async () => {
    const context = await setupTestDatabase();
    dbContext = context;
    context.mock();

    ({ registerRoutes } = await import('../server/routes'));

    srsEngineMock.regenerateQueuesOnce.mockReset();
    srsEngineMock.regenerateQueuesOnce.mockResolvedValue(undefined);
    srsEngineMock.fetchQueueForDevice.mockReset();
    srsEngineMock.generateQueueForDevice.mockReset();
    srsEngineMock.isEnabled.mockReset();
    srsEngineMock.isQueueStale.mockReset();
    srsEngineMock.fetchQueueForDevice.mockResolvedValue(null);
    srsEngineMock.generateQueueForDevice.mockResolvedValue(null);
    srsEngineMock.isEnabled.mockReturnValue(false);
    srsEngineMock.isQueueStale.mockReturnValue(true);
    shadowModeMock.runVerbQueueShadowComparison.mockReset();
    configMock.isLexemeSchemaEnabled.mockReset();
    configMock.isLexemeSchemaEnabled.mockReturnValue(true);
  });

  afterEach(async () => {
    server?.close();
    server = undefined;

    if (dbContext) {
      await dbContext.cleanup();
      dbContext = undefined;
    }
  });

  it('returns 400 when deviceId is missing', async () => {
    srsEngineMock.isEnabled.mockReturnValue(true);

    const app = express();
    registerRoutes(app);
    server = createServer(app);

    const response = await request(app).get('/api/review-queue');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'INVALID_DEVICE' });
    expect(shadowModeMock.runVerbQueueShadowComparison).not.toHaveBeenCalled();
  });

  it('returns 404 when feature flag disabled', async () => {
    srsEngineMock.isEnabled.mockReturnValue(false);

    const app = express();
    registerRoutes(app);
    server = createServer(app);

    const response = await request(app)
      .get('/api/review-queue')
      .query({ deviceId: 'device-123' });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('returns queue payload when available', async () => {
    const items: AdaptiveQueueItem[] = [
      {
        verb: 'lernen',
        priority: 1.2,
        dueAt: new Date('2024-01-01T00:00:00Z').toISOString(),
        leitnerBox: 2,
        accuracyWeight: 0.4,
        latencyWeight: 0.6,
        stabilityWeight: 0.5,
        predictedIntervalMinutes: 120,
      },
    ];

    const queueRecord = {
      deviceId: 'device-123',
      version: 'queue-version',
      generatedAt: new Date('2024-01-01T00:00:00Z'),
      validUntil: new Date('2024-01-01T00:10:00Z'),
      generationDurationMs: 42,
      itemCount: items.length,
      items,
    };

    srsEngineMock.isEnabled.mockReturnValue(true);
    srsEngineMock.fetchQueueForDevice.mockResolvedValueOnce(null);
    srsEngineMock.generateQueueForDevice.mockResolvedValueOnce(queueRecord as any);

    const app = express();
    registerRoutes(app);
    server = createServer(app);

    const response = await request(app)
      .get('/api/review-queue')
      .query({ deviceId: 'device-123' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      deviceId: 'device-123',
      version: 'queue-version',
      featureEnabled: true,
      metrics: {
        queueLength: 1,
        generationDurationMs: 42,
      },
      items: [
        expect.objectContaining({
          verb: 'lernen',
          priority: 1.2,
        }),
      ],
    });
    expect(shadowModeMock.runVerbQueueShadowComparison).toHaveBeenCalledTimes(1);
    expect(shadowModeMock.runVerbQueueShadowComparison).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-123' }),
    );

  });

  it('skips shadow comparison when lexeme schema flag is disabled', async () => {
    const items: AdaptiveQueueItem[] = [
      {
        verb: 'lernen',
        priority: 1,
        dueAt: new Date('2024-01-01T00:00:00Z').toISOString(),
        leitnerBox: 2,
        accuracyWeight: 0.5,
        latencyWeight: 0.6,
        stabilityWeight: 0.4,
        predictedIntervalMinutes: 120,
      },
    ];

    const queueRecord = {
      deviceId: 'device-456',
      version: 'queue-version',
      generatedAt: new Date('2024-01-01T00:00:00Z'),
      validUntil: new Date('2024-01-01T00:10:00Z'),
      generationDurationMs: 42,
      itemCount: items.length,
      items,
    };

    srsEngineMock.isEnabled.mockReturnValue(true);
    srsEngineMock.fetchQueueForDevice.mockResolvedValueOnce(null);
    srsEngineMock.generateQueueForDevice.mockResolvedValueOnce(queueRecord as any);
    configMock.isLexemeSchemaEnabled.mockReturnValue(false);

    const app = express();
    registerRoutes(app);
    server = createServer(app);

    await request(app)
      .get('/api/review-queue')
      .query({ deviceId: 'device-456' })
      .expect(200);

    expect(shadowModeMock.runVerbQueueShadowComparison).not.toHaveBeenCalled();
  });
});

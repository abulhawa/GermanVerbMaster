import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../server/routes';

const srsEngineMock = vi.hoisted(() => ({
  regenerateQueuesOnce: vi.fn(),
  recordPracticeAttempt: vi.fn(),
  fetchQueueForDevice: vi.fn(),
  generateQueueForDevice: vi.fn(),
  isEnabled: vi.fn(() => false),
  isQueueStale: vi.fn(() => false),
}));

const rateLimitMock = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(() =>
    Promise.resolve({ allowed: true, hits: 1, remaining: 29, resetAt: new Date(Date.now() + 60_000) }),
  ),
  hashKey: vi.fn((value: string) => value),
  configureRateLimitPool: vi.fn(),
}));

vi.mock('@db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
    query: {
      verbs: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      verbAnalytics: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      verbPracticeHistory: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('@db/schema', async () => {
  const actual = await vi.importActual<typeof import('../db/schema')>('../db/schema');
  return actual;
});

vi.mock('../server/srs', () => ({
  srsEngine: srsEngineMock,
}));

vi.mock('../server/api/rate-limit', () => rateLimitMock);

describe('POST /api/practice-history validation', () => {
  beforeEach(() => {
    rateLimitMock.enforceRateLimit.mockReset();
    rateLimitMock.enforceRateLimit.mockResolvedValue({
      allowed: true,
      hits: 1,
      remaining: 29,
      resetAt: new Date(Date.now() + 60_000),
    });
    rateLimitMock.hashKey.mockReset();
    rateLimitMock.hashKey.mockImplementation((value: string) => value);

    srsEngineMock.regenerateQueuesOnce.mockReset();
    srsEngineMock.regenerateQueuesOnce.mockResolvedValue(undefined);
    srsEngineMock.recordPracticeAttempt.mockReset();
    srsEngineMock.recordPracticeAttempt.mockResolvedValue(undefined);
    srsEngineMock.fetchQueueForDevice.mockReset();
    srsEngineMock.generateQueueForDevice.mockReset();
    srsEngineMock.isEnabled.mockReset();
    srsEngineMock.isQueueStale.mockReset();
    srsEngineMock.fetchQueueForDevice.mockResolvedValue(null);
    srsEngineMock.generateQueueForDevice.mockResolvedValue(null);
    srsEngineMock.isEnabled.mockReturnValue(false);
    srsEngineMock.isQueueStale.mockReturnValue(true);
  });

  it('rejects invalid payloads with a 400 error', async () => {
    const app = express();
    app.use(express.json());
    registerRoutes(app);
    const server = createServer(app);

    const response = await request(app).post('/api/practice-history').send({
      verb: '',
      timeSpent: -50,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: expect.any(String),
      code: 'INVALID_INPUT',
    });

    expect(srsEngineMock.recordPracticeAttempt).not.toHaveBeenCalled();

    server.close();
  });

  it('rejects requests that exceed the rate limit', async () => {
    rateLimitMock.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      hits: 31,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    const app = express();
    app.use(express.json());
    registerRoutes(app);
    const server = createServer(app);

    const response = await request(app).post('/api/practice-history').send({
      verb: 'gehen',
      mode: 'präteritum',
      result: 'correct',
      attemptedAnswer: 'ging',
      timeSpent: 1200,
      level: 'A1',
      deviceId: 'device-1234',
    });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      error: 'Too many practice submissions',
      code: 'RATE_LIMITED',
    });

    expect(srsEngineMock.recordPracticeAttempt).not.toHaveBeenCalled();

    server.close();
  });
});

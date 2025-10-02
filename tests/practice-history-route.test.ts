import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../server/routes';

const srsEngineMock = vi.hoisted(() => ({
  startQueueRegenerator: vi.fn(() => ({ stop: vi.fn() })),
  recordPracticeAttempt: vi.fn(),
  fetchQueueForDevice: vi.fn(),
  generateQueueForDevice: vi.fn(),
  isEnabled: vi.fn(() => false),
  isQueueStale: vi.fn(() => false),
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

describe('POST /api/practice-history validation', () => {
  beforeEach(() => {
    srsEngineMock.startQueueRegenerator.mockReset();
    srsEngineMock.startQueueRegenerator.mockReturnValue({ stop: vi.fn() });
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
    const server = registerRoutes(app);

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
});

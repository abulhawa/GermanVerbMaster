import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../server/routes';

const { insertValuesMock, findFirstMock } = vi.hoisted(() => ({
  insertValuesMock: vi.fn(() => Promise.resolve()),
  findFirstMock: vi.fn(),
}));

vi.mock('@db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: insertValuesMock,
    })),
    query: {
      verbs: {
        findFirst: findFirstMock,
      },
    },
  },
}));

vi.mock('@db/schema', async () => {
  const actual = await vi.importActual<typeof import('../db/schema')>('../db/schema');
  return actual;
});

describe('POST /api/admin/verbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_API_TOKEN', 'secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects requests without the admin token', async () => {
    const app = express();
    app.use(express.json());
    const server = registerRoutes(app);

    const response = await request(app).post('/api/admin/verbs').send({});

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'ADMIN_AUTH_FAILED',
    });

    server.close();
  });

  it('returns a 409 error when the verb already exists', async () => {
    const existingVerb = {
      id: 1,
      infinitive: 'gehen',
      english: 'to go',
      präteritum: 'ging',
      partizipII: 'gegangen',
      auxiliary: 'sein',
      level: 'A1',
      präteritumExample: 'Er ging nach Hause.',
      partizipIIExample: 'Er ist nach Hause gegangen.',
      source: { name: 'Duden', levelReference: 'A1' },
      pattern: { type: 'ablaut', group: 'gehen' },
      createdAt: 123,
      updatedAt: 123,
    };

    findFirstMock.mockResolvedValueOnce(existingVerb);

    const app = express();
    app.use(express.json());
    const server = registerRoutes(app);

    const response = await request(app)
      .post('/api/admin/verbs')
      .set('x-admin-token', 'secret')
      .send(existingVerb);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'VERB_EXISTS' });
    expect(insertValuesMock).not.toHaveBeenCalled();

    server.close();
  });

  it('creates a verb when provided valid data and the admin token', async () => {
    const newVerb = {
      infinitive: 'laufen',
      english: 'to run',
      präteritum: 'lief',
      partizipII: 'gelaufen',
      auxiliary: 'sein' as const,
      level: 'A2' as const,
      präteritumExample: 'Sie lief jeden Morgen.',
      partizipIIExample: 'Sie ist heute gelaufen.',
      source: { name: 'Duden', levelReference: 'A2 Kapitel 1' },
      pattern: { type: 'ablaut', group: 'laufen' },
    };

    findFirstMock.mockResolvedValueOnce(null);
    findFirstMock.mockResolvedValueOnce({
      id: 2,
      ...newVerb,
      createdAt: 111,
      updatedAt: 222,
    });

    const app = express();
    app.use(express.json());
    const server = registerRoutes(app);

    const response = await request(app)
      .post('/api/admin/verbs')
      .set('x-admin-token', 'secret')
      .send(newVerb);

    expect(response.status).toBe(201);
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      infinitive: 'laufen',
      pattern: newVerb.pattern,
    }));
    expect(response.body).toMatchObject({
      infinitive: 'laufen',
      level: 'A2',
    });

    server.close();
  });
});

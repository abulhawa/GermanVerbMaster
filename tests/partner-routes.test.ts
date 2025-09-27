import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../server/routes';
import { integrationUsage } from '../db/schema';

const hoisted = vi.hoisted(() => {
  let selectResultData: any[] = [];

  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    orderBy: vi.fn(() => selectChain),
    limit: vi.fn(() => Promise.resolve(selectResultData)),
  };

  const insertValuesMock = vi.fn(() => Promise.resolve());
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const mockDb = {
    insert: insertMock,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    select: vi.fn(() => selectChain),
    query: {
      integrationPartners: {
        findFirst: vi.fn(),
      },
      integrationUsage: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
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
  } as const;

  return {
    mockDb,
    selectChain,
    insertValuesMock,
    setSelectResultData: (data: any[]) => {
      selectResultData = data;
    },
    getSelectResultData: () => selectResultData,
  };
});

vi.mock('@db', () => ({ db: hoisted.mockDb }));

const { mockDb, selectChain, insertValuesMock, setSelectResultData } = hoisted;

const mockPartnerRecord = {
  id: 1,
  name: 'Acme LMS',
  apiKeyHash: '',
  contactEmail: 'partners@acme.test',
  allowedOrigins: null,
  scopes: [],
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const plainKey = 'partner-test-key';
const hashedKey = createHash('sha256').update(plainKey).digest('hex');

describe('Partner integration routes', () => {
beforeEach(() => {
  setSelectResultData([]);
  selectChain.from.mockClear();
  selectChain.where.mockClear();
  selectChain.orderBy.mockClear();
  selectChain.limit.mockClear();
    mockDb.select.mockClear();
    mockDb.insert.mockClear();
    insertValuesMock.mockClear();
    mockDb.query.integrationPartners.findFirst.mockReset();
    mockDb.query.integrationUsage.findMany.mockReset();
    mockDb.query.integrationPartners.findFirst.mockResolvedValue({
      ...mockPartnerRecord,
      apiKeyHash: hashedKey,
    });
  });

  it('rejects requests without an API key', async () => {
    const app = express();
    app.use(express.json());
    const server = registerRoutes(app);

    const response = await request(app).get('/api/partner/drills');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'MISSING_PARTNER_KEY' });

    server.close();
  });

  it('returns drills for authenticated partners and logs usage', async () => {
    setSelectResultData([
      {
        infinitive: 'gehen',
        english: 'to go',
        auxiliary: 'sein',
        level: 'A1',
        pattern: { group: 'irregular' },
        präteritum: 'ging',
        präteritumExample: 'Ich ging nach Hause.',
        partizipII: 'gegangen',
        partizipIIExample: 'Ich bin zur Schule gegangen.',
        source: { name: 'Duden', levelReference: 'A1' },
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);

    const app = express();
    app.use(express.json());
    const server = registerRoutes(app);

    const response = await request(app)
      .get('/api/partner/drills?level=A1&limit=5')
      .set('X-Partner-Key', plainKey);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.drills[0]).toMatchObject({
      infinitive: 'gehen',
      prompts: expect.any(Object),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockDb.insert).toHaveBeenCalledWith(integrationUsage);
    expect(insertValuesMock).toHaveBeenCalled();

    server.close();
  });

  it('summarizes usage data', async () => {
    const now = new Date();
    mockDb.query.integrationUsage.findMany.mockResolvedValue([
      {
        endpoint: '/api/partner/drills',
        method: 'GET',
        statusCode: 200,
        requestId: 'abc',
        responseTimeMs: 150,
        requestedAt: now,
      },
      {
        endpoint: '/api/partner/usage-summary',
        method: 'GET',
        statusCode: 500,
        requestId: 'def',
        responseTimeMs: 300,
        requestedAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
    ]);

    const app = express();
    app.use(express.json());
    const server = registerRoutes(app);

    const response = await request(app)
      .get('/api/partner/usage-summary?windowHours=48')
      .set('X-Partner-Key', plainKey);

    expect(response.status).toBe(200);
    expect(response.body.totals.totalRequests).toBe(2);
    expect(response.body.topEndpoints[0].endpoint).toBe('/api/partner/drills');

    server.close();
  });
});

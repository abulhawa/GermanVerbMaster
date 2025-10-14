import './helpers/mock-auth';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integrationUsage } from '@db/schema';
import { createApiInvoker } from './helpers/vercel';

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

const srsEngineMock = vi.hoisted(() => ({
  regenerateQueuesOnce: vi.fn(),
  recordPracticeAttempt: vi.fn(),
  fetchQueueForDevice: vi.fn(),
  generateQueueForDevice: vi.fn(),
  isEnabled: vi.fn(() => false),
  isQueueStale: vi.fn(() => false),
}));

vi.mock('@db', async () => {
  const schema = await vi.importActual<typeof import('../db/schema.js')>('../db/schema.js');
  return {
    db: hoisted.mockDb,
    ...schema,
  };
});

vi.mock('@db/client', () => ({
  db: hoisted.mockDb,
  createDb: () => hoisted.mockDb,
  getDb: () => hoisted.mockDb,
  createPool: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('../server/srs/index.js', () => ({
  srsEngine: srsEngineMock,
}));

const { mockDb, selectChain, insertValuesMock, setSelectResultData } = hoisted;

async function createTestInvoker() {
  const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
  const handler = createVercelApiHandler({ enableCors: false });
  return createApiInvoker(handler);
}

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

    srsEngineMock.regenerateQueuesOnce.mockReset();
    srsEngineMock.regenerateQueuesOnce.mockResolvedValue(undefined);
    srsEngineMock.recordPracticeAttempt.mockReset();
    srsEngineMock.recordPracticeAttempt.mockResolvedValue(undefined);
    srsEngineMock.fetchQueueForDevice.mockReset();
    srsEngineMock.fetchQueueForDevice.mockResolvedValue(null);
    srsEngineMock.generateQueueForDevice.mockReset();
    srsEngineMock.generateQueueForDevice.mockResolvedValue(null);
    srsEngineMock.isEnabled.mockReset();
    srsEngineMock.isQueueStale.mockReset();
    srsEngineMock.isEnabled.mockReturnValue(false);
    srsEngineMock.isQueueStale.mockReturnValue(true);
  });

  it('rejects requests without an API key', async () => {
    const invokeApi = await createTestInvoker();

    const response = await invokeApi('/api/partner/drills');

    expect(response.status).toBe(401);
    expect(response.bodyJson).toMatchObject({ code: 'MISSING_PARTNER_KEY' });
  });

  it('returns drills for authenticated partners and logs usage', async () => {
    setSelectResultData([
      {
        lemma: 'gehen',
        english: 'to go',
        aux: 'sein',
        level: 'A1',
        exampleDe: 'Ich ging nach Hause.',
        exampleEn: 'I went home.',
        separable: null,
        praeteritum: 'ging',
        partizipIi: 'gegangen',
        perfekt: 'ist gegangen',
        sourcesCsv: 'Duden',
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        approved: true,
        complete: true,
      },
    ]);

    const invokeApi = await createTestInvoker();

    const response = await invokeApi('/api/partner/drills?level=A1&limit=5', {
      headers: {
        'X-Partner-Key': plainKey,
      },
    });

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.count).toBe(1);
    expect(body.drills[0]).toMatchObject({
      infinitive: 'gehen',
      prompts: expect.any(Object),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockDb.insert).toHaveBeenCalledWith(integrationUsage);
    expect(insertValuesMock).toHaveBeenCalled();
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

    const invokeApi = await createTestInvoker();

    const response = await invokeApi('/api/partner/usage-summary?windowHours=48', {
      headers: {
        'X-Partner-Key': plainKey,
      },
    });

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.totals.totalRequests).toBe(2);
    expect(body.topEndpoints[0].endpoint).toBe('/api/partner/drills');
  });
});

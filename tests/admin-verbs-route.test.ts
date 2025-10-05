import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word } from '@shared';
import { createApiInvoker } from './helpers/vercel';

const {
  selectMock,
  fromMock,
  whereMock,
  orderByMock,
  limitMock,
  offsetMock,
  countFromMock,
  countWhereMock,
  updateMock,
  updateSetMock,
  updateWhereMock,
  findFirstMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  offsetMock: vi.fn(),
  countFromMock: vi.fn(),
  countWhereMock: vi.fn(),
  updateMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  findFirstMock: vi.fn(),
}));

const srsEngineMock = vi.hoisted(() => ({
  regenerateQueuesOnce: vi.fn(),
  recordPracticeAttempt: vi.fn(),
  fetchQueueForDevice: vi.fn(),
  generateQueueForDevice: vi.fn(),
  isEnabled: vi.fn(() => false),
  isQueueStale: vi.fn(() => false),
}));

const mockedDb = vi.hoisted(() => ({
  select: selectMock,
  update: updateMock,
  query: {
    words: {
      findFirst: findFirstMock,
    },
  },
}));

vi.mock('../db/index.js', () => ({
  db: mockedDb,
}));

vi.mock('@db', () => ({
  db: mockedDb,
}));

vi.mock('../server/db/client.js', () => ({
  db: mockedDb,
  createDb: () => mockedDb,
  getDb: () => mockedDb,
  createPool: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('../db/schema.js', async () => {
  const actual = await vi.importActual<typeof import('../db/schema.js')>('../db/schema.js');
  return actual;
});

vi.mock('../server/srs/index.js', () => ({
  srsEngine: srsEngineMock,
}));

describe('Admin words API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_API_TOKEN', 'secret');

    srsEngineMock.regenerateQueuesOnce.mockReset();
    srsEngineMock.regenerateQueuesOnce.mockResolvedValue(undefined);
    srsEngineMock.recordPracticeAttempt.mockReset();
    srsEngineMock.fetchQueueForDevice.mockReset();
    srsEngineMock.generateQueueForDevice.mockReset();
    srsEngineMock.isEnabled.mockReset();
    srsEngineMock.isQueueStale.mockReset();
    srsEngineMock.recordPracticeAttempt.mockResolvedValue(undefined);
    srsEngineMock.fetchQueueForDevice.mockResolvedValue(null);
    srsEngineMock.generateQueueForDevice.mockResolvedValue(null);
    srsEngineMock.isEnabled.mockReturnValue(false);
    srsEngineMock.isQueueStale.mockReturnValue(true);

    const dataSelectChain = { from: fromMock };
    const countSelectChain = { from: countFromMock };

    selectMock.mockImplementation((arg) => {
      if (arg && typeof arg === 'object' && 'value' in arg) {
        return countSelectChain;
      }
      return dataSelectChain;
    });

    orderByMock.mockReturnValue({ limit: limitMock });
    limitMock.mockReturnValue({ offset: offsetMock });
    whereMock.mockReturnValue({ orderBy: orderByMock });
    fromMock.mockReturnValue({ where: whereMock, orderBy: orderByMock });

    updateMock.mockReturnValue({
      set: updateSetMock.mockReturnValue({ where: updateWhereMock }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function createTestInvoker() {
    const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
    return createApiInvoker(createVercelApiHandler({ enableCors: false }));
  }

  it('rejects GET /api/words without the admin token', async () => {
    const invokeApi = await createTestInvoker();

    const response = await invokeApi('/api/words');

    expect(response.status).toBe(401);
    expect(response.bodyJson).toMatchObject({ code: 'ADMIN_AUTH_FAILED' });
  });

  it('returns words for GET /api/words when authorised', async () => {
    const rows = [
      {
        id: 1,
        lemma: 'sein',
        pos: 'V',
        level: 'A1',
        english: 'to be',
        exampleDe: 'Ich bin hier.',
        exampleEn: 'I am here.',
        gender: null,
        plural: null,
        separable: null,
        aux: 'sein',
        praesensIch: 'bin',
        praesensEr: 'ist',
        praeteritum: 'war',
        partizipIi: 'gewesen',
        perfekt: 'ist gewesen',
        comparative: null,
        superlative: null,
        canonical: true,
        complete: true,
        sourcesCsv: 'test-source',
        sourceNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const countRows = [{ value: rows.length }];
    const countPromise = Promise.resolve(countRows);

    countWhereMock.mockReturnValueOnce(countPromise);
    countFromMock.mockReturnValueOnce({
      where: countWhereMock,
      then: (onFulfilled: any, onRejected: any) => countPromise.then(onFulfilled, onRejected),
    });

    offsetMock.mockResolvedValueOnce(rows);

    const invokeApi = await createTestInvoker();

    const response = await invokeApi('/api/words', {
      headers: {
        'x-admin-token': 'secret',
      },
    });

    expect(response.status).toBe(200);
    const body = response.bodyJson as any;
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({
      page: 1,
      perPage: 50,
      total: rows.length,
      totalPages: 1,
    });
    expect(selectMock).toHaveBeenCalled();
    expect(orderByMock).toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledWith(50);
    expect(offsetMock).toHaveBeenCalledWith(0);
  });

  it('recomputes completeness when updating a verb', async () => {
    const existing = {
      id: 3,
      lemma: 'laufen',
      pos: 'V' as const,
      level: 'A2',
      english: 'to run',
      exampleDe: null,
      exampleEn: null,
      gender: null,
      plural: null,
      separable: null,
      aux: 'sein' as const,
      praesensIch: null,
      praesensEr: null,
      praeteritum: null,
      partizipIi: null,
      perfekt: null,
      comparative: null,
      superlative: null,
      canonical: true,
      complete: false,
      sourcesCsv: null,
      sourceNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Word;

    const updated = { ...existing, praeteritum: 'lief', partizipIi: 'gelaufen', perfekt: 'ist gelaufen', complete: true };

    findFirstMock
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);

    const invokeApi = await createTestInvoker();

    const response = await invokeApi('/api/words/3', {
      method: 'PATCH',
      headers: {
        'x-admin-token': 'secret',
      },
      body: {
        praeteritum: 'lief',
        partizipIi: 'gelaufen',
        perfekt: 'ist gelaufen',
      },
    });

    expect(response.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      praeteritum: 'lief',
      partizipIi: 'gelaufen',
      perfekt: 'ist gelaufen',
      complete: true,
    }));
  });
});

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word } from '@shared';
import { registerRoutes } from '../server/routes';

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

vi.mock('@db', () => ({
  db: {
    select: selectMock,
    update: updateMock,
    query: {
      words: {
        findFirst: findFirstMock,
      },
    },
  },
}));

vi.mock('@db/schema', async () => {
  const actual = await vi.importActual<typeof import('../db/schema')>('../db/schema');
  return actual;
});

describe('Admin words API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_API_TOKEN', 'secret');

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

  it('rejects GET /api/words without the admin token', async () => {
    const app = express();
    const server = registerRoutes(app);

    const response = await request(app).get('/api/words');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'ADMIN_AUTH_FAILED' });

    server.close();
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

    const app = express();
    const server = registerRoutes(app);

    const response = await request(app)
      .get('/api/words')
      .set('x-admin-token', 'secret');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({
      page: 1,
      perPage: 50,
      total: rows.length,
      totalPages: 1,
    });
    expect(selectMock).toHaveBeenCalled();
    expect(orderByMock).toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledWith(50);
    expect(offsetMock).toHaveBeenCalledWith(0);

    server.close();
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

    const app = express();
    app.use(express.json());
    const server = registerRoutes(app);

    const response = await request(app)
      .patch('/api/words/3')
      .set('x-admin-token', 'secret')
      .send({
        praeteritum: 'lief',
        partizipIi: 'gelaufen',
        perfekt: 'ist gelaufen',
      });

    expect(response.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({
      praeteritum: 'lief',
      partizipIi: 'gelaufen',
      perfekt: 'ist gelaufen',
      complete: true,
    }));

    server.close();
  });
});

import './helpers/mock-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionFromRequestMock } from './helpers/mock-auth';
import { createApiInvoker } from './helpers/vercel';

const dbMock = vi.hoisted(() => ({
  insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  select: vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  })),
  query: {
    verbPracticeHistory: { findMany: vi.fn(() => Promise.resolve([])) },
    verbAnalytics: { findFirst: vi.fn(() => Promise.resolve(null)) },
    words: { findFirst: vi.fn(() => Promise.resolve(null)) },
    integrationPartners: { findFirst: vi.fn(() => Promise.resolve(null)) },
    integrationUsage: { findMany: vi.fn(() => Promise.resolve([])) },
  },
}));

vi.mock('@db', async () => {
  const schema = await vi.importActual<typeof import('../db/schema.js')>('../db/schema.js');
  return {
    ...schema,
    db: dbMock,
  } satisfies typeof schema & { db: typeof dbMock };
});

vi.mock('@db/client', () => ({
  db: dbMock,
  createDb: () => dbMock,
  getDb: () => dbMock,
  createPool: vi.fn(),
  getPool: vi.fn(),
}));

describe('GET /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionFromRequestMock.mockReset();
    getSessionFromRequestMock.mockResolvedValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
    const invokeApi = createApiInvoker(createVercelApiHandler({ enableCors: false }));

    const response = await invokeApi('/api/me');

    expect(response.status).toBe(401);
    expect(response.bodyJson).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('returns 401 when the session payload is incomplete', async () => {
    getSessionFromRequestMock.mockResolvedValueOnce({
      session: null,
      user: null,
    } as any);

    const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
    const invokeApi = createApiInvoker(createVercelApiHandler({ enableCors: false }));

    const response = await invokeApi('/api/me');

    expect(response.status).toBe(401);
    expect(response.bodyJson).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('returns session payload when authenticated', async () => {
    const now = new Date('2024-01-02T03:04:05.000Z');

    getSessionFromRequestMock.mockResolvedValueOnce({
      session: {
        id: 'session-123',
        expiresAt: now,
      },
      user: {
        id: 'user-1',
        name: 'Test User',
        email: 'user@example.com',
        image: null,
        emailVerified: true,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      },
    } as any);

    const { createVercelApiHandler } = await import('../server/api/vercel-handler.js');
    const invokeApi = createApiInvoker(createVercelApiHandler({ enableCors: false }));

    const response = await invokeApi('/api/me');

    expect(response.status).toBe(200);
    expect(response.bodyJson).toMatchObject({
      session: {
        id: 'session-123',
        expiresAt: now.toISOString(),
      },
      user: {
        id: 'user-1',
        name: 'Test User',
        email: 'user@example.com',
        image: null,
        emailVerified: true,
        role: 'admin',
      },
    });
  });
});

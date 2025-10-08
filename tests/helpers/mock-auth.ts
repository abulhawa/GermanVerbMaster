import express from 'express';
import { vi } from 'vitest';

type AuthModule = typeof import('../../server/auth/index.js');

export const getSessionFromRequestMock = vi.fn<
  Parameters<AuthModule['getSessionFromRequest']>,
  ReturnType<AuthModule['getSessionFromRequest']>
>(() => Promise.resolve(null));

const passthroughRouter = express.Router();
passthroughRouter.use((_req, _res, next) => next());

vi.mock('../../server/auth/index.js', () => ({
  authRouter: passthroughRouter,
  getSessionFromRequest: getSessionFromRequestMock,
  requireSession: vi.fn(() => (_req, _res, next) => next()),
  requireAdmin: vi.fn(() => (_req, _res, next) => next()),
  auth: {},
}));

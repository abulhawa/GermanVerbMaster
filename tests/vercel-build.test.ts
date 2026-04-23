import { describe, expect, it } from 'vitest';

import {
  getVercelBuildSteps,
  isProductionVercelDeployment,
} from '../scripts/vercel-build';

describe('vercel build orchestration', () => {
  it('refreshes seeded content for production deployments', () => {
    const env = { VERCEL_ENV: 'production' } as NodeJS.ProcessEnv;

    expect(isProductionVercelDeployment(env)).toBe(true);
    expect(getVercelBuildSteps(env)).toEqual(['seed', 'build:tasks', 'build']);
  });

  it('skips seeded content refresh for preview deployments', () => {
    const env = { VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv;

    expect(isProductionVercelDeployment(env)).toBe(false);
    expect(getVercelBuildSteps(env)).toEqual(['build']);
  });

  it('treats VERCEL_ENV values case-insensitively', () => {
    const env = { VERCEL_ENV: 'Production' } as NodeJS.ProcessEnv;

    expect(isProductionVercelDeployment(env)).toBe(true);
    expect(getVercelBuildSteps(env)).toEqual(['seed', 'build:tasks', 'build']);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { configureRateLimitPool, enforceRateLimit, hashKey } from '../server/api/rate-limit.js';

describe('rate limit helper', () => {
  beforeEach(() => {
    configureRateLimitPool();
  });

  it('persists counters across multiple calls', async () => {
    const key = hashKey('test-device');

    const first = await enforceRateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    expect(first.hits).toBe(1);
    expect(first.remaining).toBe(1);

    const second = await enforceRateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(second.allowed).toBe(true);
    expect(second.hits).toBe(2);
    expect(second.remaining).toBe(0);

    const third = await enforceRateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(third.allowed).toBe(false);
    expect(third.hits).toBe(3);
  });
});

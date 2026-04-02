import { describe, expect, it } from 'vitest';

import { createSeededTaskOrderToken } from '../server/routes/tasks/queries.js';

describe('createSeededTaskOrderToken', () => {
  it('returns the same token for the same task and seed', () => {
    const first = createSeededTaskOrderToken('task-1', 'seed-abc');
    const second = createSeededTaskOrderToken('task-1', 'seed-abc');

    expect(first).toBe(second);
    expect(first).toHaveLength(32);
  });

  it('returns different tokens for different seeds', () => {
    for (let index = 0; index < 10; index += 1) {
      const first = createSeededTaskOrderToken(`task-${index}`, `seed-a-${index}`);
      const second = createSeededTaskOrderToken(`task-${index}`, `seed-b-${index}`);
      expect(first).not.toBe(second);
    }
  });

  it('handles an empty seed without throwing', () => {
    expect(() => createSeededTaskOrderToken('task-empty', '')).not.toThrow();
    expect(createSeededTaskOrderToken('task-empty', '')).toHaveLength(32);
  });
});

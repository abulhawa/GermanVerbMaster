import { describe, expect, it } from 'vitest';

import { parseBooleanOption, parseSeedOptions } from '../../../scripts/seed/options';

describe('seed options', () => {
  it('defaults to no reset when no flags are provided', () => {
    expect(parseSeedOptions([])).toEqual({ reset: false });
  });

  it('enables reset when --reset is provided', () => {
    expect(parseSeedOptions(['--reset'])).toEqual({ reset: true });
    expect(parseSeedOptions(['-r'])).toEqual({ reset: true });
  });

  it('respects --no-reset flag', () => {
    expect(parseSeedOptions(['--reset', '--no-reset'])).toEqual({ reset: false });
  });

  it('parses assignment flags with boolean values', () => {
    expect(parseSeedOptions(['--reset=false'])).toEqual({ reset: false });
    expect(parseSeedOptions(['--reset=yes'])).toEqual({ reset: true });
  });

  it('supports explicit boolean parsing helper', () => {
    expect(parseBooleanOption(undefined)).toBe(true);
    expect(parseBooleanOption('0')).toBe(false);
    expect(parseBooleanOption('false')).toBe(false);
    expect(parseBooleanOption('true')).toBe(true);
    expect(parseBooleanOption('unexpected')).toBe(true);
  });
});

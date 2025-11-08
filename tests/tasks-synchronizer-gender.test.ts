import { describe, expect, it } from 'vitest';

import { normaliseGenderValue } from '../server/tasks/synchronizer.js';

describe('normaliseGenderValue', () => {
  it('returns null for empty or placeholder values', () => {
    expect(normaliseGenderValue(null)).toBeNull();
    expect(normaliseGenderValue('')).toBeNull();
    expect(normaliseGenderValue('   ')).toBeNull();
    expect(normaliseGenderValue('null')).toBeNull();
  });

  it('keeps valid simple values unchanged', () => {
    expect(normaliseGenderValue('der')).toBe('der');
    expect(normaliseGenderValue('die')).toBe('die');
    expect(normaliseGenderValue('das')).toBe('das');
  });

  it('normalises comma or slash separated combinations', () => {
    expect(normaliseGenderValue('die/der')).toBe('der/die');
    expect(normaliseGenderValue('der, das')).toBe('der/das');
    expect(normaliseGenderValue('das,die')).toBe('die/das');
  });

  it('returns null for unsupported genders', () => {
    expect(normaliseGenderValue('mask')).toBeNull();
    expect(normaliseGenderValue('der, die, das')).toBeNull();
    expect(normaliseGenderValue('die, plural')).toBeNull();
  });
});

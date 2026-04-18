import { describe, expect, it } from 'vitest';

import { normalizeCurrency, normalizeEmail } from '../src/lib/normalize.js';

describe('normalizers', () => {
  it('normalizes emails by trimming and lowercasing', () => {
    expect(normalizeEmail('  Dwiki@Example.COM ')).toBe('dwiki@example.com');
  });

  it('normalizes currencies to ISO-style uppercase codes', () => {
    expect(normalizeCurrency('idr')).toBe('IDR');
  });
});

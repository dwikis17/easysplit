import { describe, expect, it } from 'vitest';
import { SplitMethod } from '@prisma/client';

import { computeSplits } from '../src/lib/splits.js';

describe('computeSplits', () => {
  it('splits equal amounts and distributes remainder deterministically', () => {
    const result = computeSplits(SplitMethod.EQUAL, 100, [
      { user_id: 'a' },
      { user_id: 'b' },
      { user_id: 'c' },
    ]);

    expect(result.map((item) => item.originalOwedAmountMinor)).toEqual([34, 33, 33]);
  });

  it('validates exact totals', () => {
    expect(() =>
      computeSplits(SplitMethod.EXACT, 100, [
        { user_id: 'a', amount_minor: 20 },
        { user_id: 'b', amount_minor: 70 },
      ]),
    ).toThrowError(/Split totals do not match expense total/);
  });

  it('converts percentage input to minor-unit shares', () => {
    const result = computeSplits(SplitMethod.PERCENTAGE, 1000, [
      { user_id: 'a', percentage: '50.00' },
      { user_id: 'b', percentage: '30.00' },
      { user_id: 'c', percentage: '20.00' },
    ]);

    expect(result.map((item) => item.originalOwedAmountMinor)).toEqual([500, 300, 200]);
  });
});

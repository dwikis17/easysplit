import { describe, expect, it } from 'vitest';

import { simplifyDebts } from '../src/lib/balances.js';

describe('simplifyDebts', () => {
  it('reduces net balances to settlement suggestions', () => {
    const result = simplifyDebts({
      alice: 500000,
      bob: -300000,
      carol: -200000,
    });

    expect(result).toEqual([
      {
        fromUserId: 'bob',
        toUserId: 'alice',
        amount: 300000,
      },
      {
        fromUserId: 'carol',
        toUserId: 'alice',
        amount: 200000,
      },
    ]);
  });
});

import { PrismaClient } from '@prisma/client';

import { normalizeCurrency } from './normalize.js';

export async function resolveFxRate(
  prisma: PrismaClient,
  originalCurrency: string,
  baseCurrency: string,
) {
  const original = normalizeCurrency(originalCurrency);
  const base = normalizeCurrency(baseCurrency);

  if (original === base) {
    return { rate: 1, source: 'identity' };
  }

  const rate = await prisma.exchangeRate.findFirst({
    where: {
      baseCurrency: original,
      quoteCurrency: base,
    },
    orderBy: {
      effectiveAt: 'desc',
    },
  });

  if (!rate) {
    return { rate: 1, source: 'manual_fallback' };
  }

  return {
    rate: Number(rate.rate),
    source: rate.source,
  };
}

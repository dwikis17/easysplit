import { Decimal } from '@prisma/client/runtime/library';

import { ValidationError } from './errors.js';

export type CurrencyAmount = {
  minor: number;
  currency: string;
};

export function assertPositiveMinor(minor: number, field = 'amount.minor') {
  if (!Number.isInteger(minor) || minor <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
}

export function decimalToMinor(decimal: Decimal | string | number) {
  return Math.round(Number(decimal));
}

export function normalizeRate(rate: number | string) {
  const parsed = Number(rate);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ValidationError('fx_rate must be positive');
  }

  return parsed;
}

export function toBaseMinor(minor: number, fxRate: number | string) {
  return Math.round(minor * normalizeRate(fxRate));
}

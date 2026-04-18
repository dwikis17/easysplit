import { SplitMethod, SplitInputType } from '@prisma/client';

import { ValidationError } from './errors.js';

export type RawParticipantInput = {
  user_id: string;
  amount_minor?: number;
  percentage?: string;
};

export type ComputedSplit = {
  userId: string;
  splitType: SplitInputType;
  originalOwedAmountMinor: number;
  percentageBasisPoints: number | null;
  exactAmountMinor: number | null;
};

function distributeRemainder(total: number, base: number, count: number) {
  const items = Array.from({ length: count }, () => base);
  let remainder = total - base * count;
  let index = 0;

  while (remainder > 0) {
    items[index] += 1;
    remainder -= 1;
    index += 1;
  }

  return items;
}

export function computeSplits(
  splitMethod: SplitMethod,
  totalMinor: number,
  participants: RawParticipantInput[],
): ComputedSplit[] {
  if (participants.length === 0) {
    throw new ValidationError('participants must not be empty');
  }

  if (splitMethod === SplitMethod.EQUAL) {
    const base = Math.floor(totalMinor / participants.length);
    const distributed = distributeRemainder(totalMinor, base, participants.length);

    return participants.map((participant, index) => ({
      userId: participant.user_id,
      splitType: SplitInputType.EQUAL,
      originalOwedAmountMinor: distributed[index],
      percentageBasisPoints: null,
      exactAmountMinor: null,
    }));
  }

  if (splitMethod === SplitMethod.EXACT) {
    const computed = participants.map((participant) => {
      if (!Number.isInteger(participant.amount_minor)) {
        throw new ValidationError('participants.amount_minor is required for exact split');
      }

      return {
        userId: participant.user_id,
        splitType: SplitInputType.EXACT,
        originalOwedAmountMinor: participant.amount_minor!,
        percentageBasisPoints: null,
        exactAmountMinor: participant.amount_minor!,
      };
    });

    const sum = computed.reduce((acc, item) => acc + item.originalOwedAmountMinor, 0);
    if (sum !== totalMinor) {
      throw new ValidationError('Split totals do not match expense total');
    }

    return computed;
  }

  if (splitMethod === SplitMethod.PERCENTAGE) {
    const basisPoints = participants.map((participant) => {
      if (participant.percentage == null) {
        throw new ValidationError('participants.percentage is required for percentage split');
      }

      const parsed = Number(participant.percentage);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new ValidationError('participants.percentage must be positive');
      }

      return Math.round(parsed * 100);
    });

    const totalBasisPoints = basisPoints.reduce((acc, value) => acc + value, 0);
    if (totalBasisPoints !== 10000) {
      throw new ValidationError('Percentages must sum to 100.00');
    }

    const rawShares = basisPoints.map((bp) => (totalMinor * bp) / 10000);
    const floors = rawShares.map((value) => Math.floor(value));
    let remainder = totalMinor - floors.reduce((acc, value) => acc + value, 0);
    const order = rawShares
      .map((value, index) => ({ index, remainder: value - floors[index] }))
      .sort((a, b) => b.remainder - a.remainder);

    while (remainder > 0) {
      floors[order[(remainder - 1) % order.length].index] += 1;
      remainder -= 1;
    }

    return participants.map((participant, index) => ({
      userId: participant.user_id,
      splitType: SplitInputType.PERCENTAGE,
      originalOwedAmountMinor: floors[index],
      percentageBasisPoints: basisPoints[index],
      exactAmountMinor: null,
    }));
  }

  throw new ValidationError(`Unsupported split method: ${splitMethod}`);
}

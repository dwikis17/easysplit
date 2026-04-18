import { ActivityEntityType, IdempotencyOperation, RecordStatus } from '@prisma/client';

import { createActivityLog } from '../../lib/activity.js';
import { assertUsersActiveMembers, requireMembership } from '../../lib/group-access.js';
import { findIdempotentResponse, saveIdempotentResponse } from '../../lib/idempotency.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { resolveFxRate } from '../../lib/fx.js';
import { toBaseMinor } from '../../lib/money.js';
import { normalizeCurrency } from '../../lib/normalize.js';
import { parseCursorLimit } from '../../lib/pagination.js';
import { prisma } from '../../prisma/client.js';

function serializeSettlement(settlement: {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  originalAmountMinor: number;
  originalCurrency: string;
  baseAmountMinor: number;
  baseCurrency: string;
  fxRate: unknown;
  settlementDate: Date;
  notes: string | null;
  status: RecordStatus;
  createdByUserId: string;
  createdAt: Date;
}) {
  return {
    id: settlement.id,
    group_id: settlement.groupId,
    from_user_id: settlement.fromUserId,
    to_user_id: settlement.toUserId,
    original_amount_minor: settlement.originalAmountMinor,
    original_currency: settlement.originalCurrency,
    base_amount_minor: settlement.baseAmountMinor,
    base_currency: settlement.baseCurrency,
    fx_rate: String(settlement.fxRate),
    settlement_date: settlement.settlementDate.toISOString().slice(0, 10),
    notes: settlement.notes,
    status: settlement.status.toLowerCase(),
    created_by_user_id: settlement.createdByUserId,
    created_at: settlement.createdAt.toISOString(),
  };
}

export async function createSettlement(
  userId: string,
  groupId: string,
  input: {
    from_user_id: string;
    to_user_id: string;
    amount: { minor: number; currency: string };
    settlement_date: string;
    notes?: string;
  },
  idempotencyKey?: string,
) {
  const { group } = await requireMembership(userId, groupId);

  if (group.status !== 'ACTIVE') {
    throw new ForbiddenError('Archived groups cannot be modified');
  }

  if (input.from_user_id === input.to_user_id) {
    throw new ValidationError('from_user_id and to_user_id must differ');
  }

  if (idempotencyKey) {
    const replay = await findIdempotentResponse(prisma, {
      groupId,
      userId,
      key: idempotencyKey,
      operation: IdempotencyOperation.CREATE_SETTLEMENT,
      payload: input,
    });
    if (replay) {
      return replay.body;
    }
  }

  await assertUsersActiveMembers(groupId, [input.from_user_id, input.to_user_id]);
  const fx = await resolveFxRate(prisma, input.amount.currency, group.baseCurrency);
  const settlement = await prisma.$transaction(async (tx) => {
    const created = await tx.settlement.create({
      data: {
        groupId,
        createdByUserId: userId,
        fromUserId: input.from_user_id,
        toUserId: input.to_user_id,
        originalAmountMinor: input.amount.minor,
        originalCurrency: normalizeCurrency(input.amount.currency),
        baseAmountMinor: toBaseMinor(input.amount.minor, fx.rate),
        baseCurrency: group.baseCurrency,
        fxRate: fx.rate,
        settlementDate: new Date(input.settlement_date),
        notes: input.notes,
      },
    });

    await createActivityLog(tx, {
      groupId,
      actorUserId: userId,
      entityType: ActivityEntityType.SETTLEMENT,
      entityId: created.id,
      action: 'settlement_created',
    });

    const result = { settlement: serializeSettlement(created) };

    if (idempotencyKey) {
      await saveIdempotentResponse(tx, {
        groupId,
        userId,
        key: idempotencyKey,
        operation: IdempotencyOperation.CREATE_SETTLEMENT,
        payload: input,
        responseStatus: 201,
        responseBody: result,
      });
    }

    return result;
  });

  return settlement;
}

export async function listSettlements(
  userId: string,
  groupId: string,
  query: { cursor?: string; limit?: string; from_date?: string; to_date?: string; status?: 'active' | 'deleted' },
) {
  await requireMembership(userId, groupId);
  const limit = parseCursorLimit(query.limit);
  const settlements = await prisma.settlement.findMany({
    where: {
      groupId,
      ...(query.from_date || query.to_date
        ? {
            settlementDate: {
              ...(query.from_date ? { gte: new Date(query.from_date) } : {}),
              ...(query.to_date ? { lte: new Date(query.to_date) } : {}),
            },
          }
        : {}),
      ...(query.status
        ? { status: query.status === 'deleted' ? RecordStatus.DELETED : RecordStatus.ACTIVE }
        : { status: RecordStatus.ACTIVE }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasNext = settlements.length > limit;
  return {
    items: settlements.slice(0, limit).map(serializeSettlement),
    next_cursor: hasNext ? settlements[limit - 1]?.id ?? null : null,
  };
}

export async function getSettlement(userId: string, settlementId: string) {
  const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
  if (!settlement) throw new NotFoundError('Settlement not found');
  await requireMembership(userId, settlement.groupId);
  return { settlement: serializeSettlement(settlement) };
}

export async function deleteSettlement(userId: string, settlementId: string) {
  const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
  if (!settlement) throw new NotFoundError('Settlement not found');
  const { group, membership } = await requireMembership(userId, settlement.groupId);
  if (group.status !== 'ACTIVE') {
    throw new ForbiddenError('Archived groups cannot be modified');
  }
  if (![settlement.createdByUserId, null].includes(userId) && !['ADMIN', 'OWNER'].includes(membership.role)) {
    throw new ForbiddenError('You cannot delete this settlement');
  }

  await prisma.settlement.update({
    where: { id: settlementId },
    data: {
      status: RecordStatus.DELETED,
      deletedAt: new Date(),
    },
  });

  await createActivityLog(prisma, {
    groupId: settlement.groupId,
    actorUserId: userId,
    entityType: ActivityEntityType.SETTLEMENT,
    entityId: settlementId,
    action: 'settlement_deleted',
  });
}

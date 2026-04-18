import { ActivityEntityType, IdempotencyOperation, RecordStatus, SplitMethod } from '@prisma/client';

import { createActivityLog } from '../../lib/activity.js';
import { assertUsersActiveMembers, requireMembership } from '../../lib/group-access.js';
import { findIdempotentResponse, saveIdempotentResponse } from '../../lib/idempotency.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { resolveFxRate } from '../../lib/fx.js';
import { toBaseMinor } from '../../lib/money.js';
import { normalizeCurrency } from '../../lib/normalize.js';
import { parseCursorLimit } from '../../lib/pagination.js';
import { computeSplits } from '../../lib/splits.js';
import { prisma } from '../../prisma/client.js';

function serializeExpense(expense: {
  id: string;
  groupId: string;
  title: string;
  category: string | null;
  notes: string | null;
  expenseDate: Date;
  originalAmountMinor: number;
  originalCurrency: string;
  baseAmountMinor: number;
  baseCurrency: string;
  fxRate: unknown;
  fxSource: string;
  splitMethod: SplitMethod;
  status: RecordStatus;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  payers?: Array<{ userId: string; originalPaidAmountMinor: number; basePaidAmountMinor: number }>;
  splits?: Array<{ userId: string; baseOwedAmountMinor: number }>;
}) {
  return {
    id: expense.id,
    group_id: expense.groupId,
    title: expense.title,
    category: expense.category,
    notes: expense.notes,
    expense_date: expense.expenseDate.toISOString().slice(0, 10),
    original_amount_minor: expense.originalAmountMinor,
    original_currency: expense.originalCurrency,
    base_amount_minor: expense.baseAmountMinor,
    base_currency: expense.baseCurrency,
    fx_rate: String(expense.fxRate),
    fx_source: expense.fxSource,
    split_method: expense.splitMethod.toLowerCase(),
    status: expense.status.toLowerCase(),
    created_by_user_id: expense.createdByUserId,
    created_at: expense.createdAt.toISOString(),
    updated_at: expense.updatedAt.toISOString(),
    ...(expense.payers
      ? {
          paid_by: expense.payers.map((payer) => ({
            user_id: payer.userId,
            original_paid_amount_minor: payer.originalPaidAmountMinor,
            base_paid_amount_minor: payer.basePaidAmountMinor,
          })),
        }
      : {}),
    ...(expense.splits
      ? {
          splits: expense.splits.map((split) => ({
            user_id: split.userId,
            base_owed_amount_minor: split.baseOwedAmountMinor,
          })),
        }
      : {}),
  };
}

function ensureMutableGroup(groupStatus: string) {
  if (groupStatus !== 'ACTIVE') {
    throw new ForbiddenError('Archived groups cannot be modified');
  }
}

function sumPayers(paidBy: Array<{ amount_minor: number }>) {
  return paidBy.reduce((acc, payer) => acc + payer.amount_minor, 0);
}

async function buildExpenseLedger(
  groupId: string,
  input: {
    amount: { minor: number; currency: string };
    paid_by: Array<{ user_id: string; amount_minor: number }>;
    split_method: 'equal' | 'exact' | 'percentage';
    participants: Array<{ user_id: string; amount_minor?: number; percentage?: string }>;
  },
  baseCurrency: string,
) {
  if (sumPayers(input.paid_by) !== input.amount.minor) {
    throw new ValidationError('Sum of paid_by.amount_minor must equal total expense amount');
  }

  const userIds = [...input.paid_by.map((payer) => payer.user_id), ...input.participants.map((participant) => participant.user_id)];
  await assertUsersActiveMembers(groupId, userIds);

  const fx = await resolveFxRate(prisma, input.amount.currency, baseCurrency);
  const splits = computeSplits(
    SplitMethod[input.split_method.toUpperCase() as keyof typeof SplitMethod],
    input.amount.minor,
    input.participants,
  );

  return {
    originalCurrency: normalizeCurrency(input.amount.currency),
    baseCurrency,
    fxRate: fx.rate,
    fxSource: fx.source,
    baseAmountMinor: toBaseMinor(input.amount.minor, fx.rate),
    payers: input.paid_by.map((payer) => ({
      userId: payer.user_id,
      originalPaidAmountMinor: payer.amount_minor,
      basePaidAmountMinor: toBaseMinor(payer.amount_minor, fx.rate),
    })),
    splits: splits.map((split) => ({
      userId: split.userId,
      splitType: split.splitType,
      originalOwedAmountMinor: split.originalOwedAmountMinor,
      baseOwedAmountMinor: toBaseMinor(split.originalOwedAmountMinor, fx.rate),
      percentageBasisPoints: split.percentageBasisPoints,
      exactAmountMinor: split.exactAmountMinor,
    })),
  };
}

function canEditExpense(actorUserId: string, expenseCreatorId: string, role: string) {
  return actorUserId === expenseCreatorId || role === 'ADMIN' || role === 'OWNER';
}

export async function createExpense(
  userId: string,
  groupId: string,
  input: {
    title: string;
    category?: string;
    notes?: string;
    expense_date: string;
    amount: { minor: number; currency: string };
    paid_by: Array<{ user_id: string; amount_minor: number }>;
    split_method: 'equal' | 'exact' | 'percentage';
    participants: Array<{ user_id: string; amount_minor?: number; percentage?: string }>;
    receipt_url?: string;
  },
  idempotencyKey?: string,
) {
  const { group, membership } = await requireMembership(userId, groupId);
  ensureMutableGroup(group.status);

  if (idempotencyKey) {
    const replay = await findIdempotentResponse(prisma, {
      groupId,
      userId,
      key: idempotencyKey,
      operation: IdempotencyOperation.CREATE_EXPENSE,
      payload: input,
    });
    if (replay) {
      return replay.body;
    }
  }

  const ledger = await buildExpenseLedger(groupId, input, group.baseCurrency);
  const created = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        groupId,
        createdByUserId: userId,
        title: input.title,
        category: input.category,
        notes: input.notes,
        expenseDate: new Date(input.expense_date),
        originalAmountMinor: input.amount.minor,
        originalCurrency: ledger.originalCurrency,
        baseAmountMinor: ledger.baseAmountMinor,
        baseCurrency: ledger.baseCurrency,
        fxRate: ledger.fxRate,
        fxSource: ledger.fxSource,
        splitMethod: SplitMethod[input.split_method.toUpperCase() as keyof typeof SplitMethod],
        receiptPath: input.receipt_url,
      },
    });

    await tx.expensePayer.createMany({
      data: ledger.payers.map((payer) => ({
        expenseId: expense.id,
        userId: payer.userId,
        originalPaidAmountMinor: payer.originalPaidAmountMinor,
        basePaidAmountMinor: payer.basePaidAmountMinor,
      })),
    });

    await tx.expenseSplit.createMany({
      data: ledger.splits.map((split) => ({
        expenseId: expense.id,
        userId: split.userId,
        splitType: split.splitType,
        originalOwedAmountMinor: split.originalOwedAmountMinor,
        baseOwedAmountMinor: split.baseOwedAmountMinor,
        percentageBasisPoints: split.percentageBasisPoints,
        exactAmountMinor: split.exactAmountMinor,
      })),
    });

    await createActivityLog(tx, {
      groupId,
      expenseId: expense.id,
      actorUserId: userId,
      entityType: ActivityEntityType.EXPENSE,
      entityId: expense.id,
      action: 'expense_created',
      payload: { title: input.title },
    });

    const result = {
      expense: serializeExpense({
        ...expense,
        payers: ledger.payers,
        splits: ledger.splits,
      }),
    };

    if (idempotencyKey) {
      await saveIdempotentResponse(tx, {
        groupId,
        userId,
        key: idempotencyKey,
        operation: IdempotencyOperation.CREATE_EXPENSE,
        payload: input,
        responseStatus: 201,
        responseBody: result,
      });
    }

    return result;
  });

  if (!canEditExpense(userId, userId, membership.role)) {
    throw new ForbiddenError('Unexpected membership state');
  }

  return created;
}

export async function listExpenses(
  userId: string,
  groupId: string,
  query: {
    cursor?: string;
    limit?: string;
    from_date?: string;
    to_date?: string;
    created_by_user_id?: string;
    category?: string;
    status?: 'active' | 'deleted';
  },
) {
  await requireMembership(userId, groupId);
  const limit = parseCursorLimit(query.limit);
  const items = await prisma.expense.findMany({
    where: {
      groupId,
      ...(query.from_date || query.to_date
        ? {
            expenseDate: {
              ...(query.from_date ? { gte: new Date(query.from_date) } : {}),
              ...(query.to_date ? { lte: new Date(query.to_date) } : {}),
            },
          }
        : {}),
      ...(query.created_by_user_id ? { createdByUserId: query.created_by_user_id } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status
        ? { status: query.status === 'deleted' ? RecordStatus.DELETED : RecordStatus.ACTIVE }
        : { status: RecordStatus.ACTIVE }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasNext = items.length > limit;
  return {
    items: items.slice(0, limit).map((expense) => serializeExpense(expense)),
    next_cursor: hasNext ? items[limit - 1]?.id ?? null : null,
  };
}

export async function getExpense(userId: string, expenseId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { payers: true, splits: true },
  });

  if (!expense) throw new NotFoundError('Expense not found');
  await requireMembership(userId, expense.groupId);
  return { expense: serializeExpense(expense) };
}

export async function updateExpense(
  userId: string,
  expenseId: string,
  input: Partial<{
    title: string;
    category?: string;
    notes?: string;
    expense_date: string;
    amount: { minor: number; currency: string };
    paid_by: Array<{ user_id: string; amount_minor: number }>;
    split_method: 'equal' | 'exact' | 'percentage';
    participants: Array<{ user_id: string; amount_minor?: number; percentage?: string }>;
    receipt_url?: string;
  }>,
) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { payers: true, splits: true },
  });
  if (!expense) throw new NotFoundError('Expense not found');
  const { group, membership } = await requireMembership(userId, expense.groupId);
  ensureMutableGroup(group.status);
  if (!canEditExpense(userId, expense.createdByUserId, membership.role)) {
    throw new ForbiddenError('You cannot edit this expense');
  }

  const merged = {
    title: input.title ?? expense.title,
    category: input.category ?? expense.category ?? undefined,
    notes: input.notes ?? expense.notes ?? undefined,
    expense_date: input.expense_date ?? expense.expenseDate.toISOString().slice(0, 10),
    amount: input.amount ?? {
      minor: expense.originalAmountMinor,
      currency: expense.originalCurrency,
    },
    paid_by:
      input.paid_by ??
      expense.payers.map((payer) => ({
        user_id: payer.userId,
        amount_minor: payer.originalPaidAmountMinor,
      })),
    split_method: input.split_method ?? expense.splitMethod.toLowerCase(),
    participants:
      input.participants ??
      expense.splits.map((split) => ({
        user_id: split.userId,
        amount_minor: split.exactAmountMinor ?? undefined,
        percentage: split.percentageBasisPoints != null ? (split.percentageBasisPoints / 100).toFixed(2) : undefined,
      })),
    receipt_url: input.receipt_url ?? expense.receiptPath ?? undefined,
  } as {
    title: string;
    category?: string;
    notes?: string;
    expense_date: string;
    amount: { minor: number; currency: string };
    paid_by: Array<{ user_id: string; amount_minor: number }>;
    split_method: 'equal' | 'exact' | 'percentage';
    participants: Array<{ user_id: string; amount_minor?: number; percentage?: string }>;
    receipt_url?: string;
  };

  const ledger = await buildExpenseLedger(expense.groupId, merged, group.baseCurrency);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.expensePayer.deleteMany({ where: { expenseId } });
    await tx.expenseSplit.deleteMany({ where: { expenseId } });

    const nextExpense = await tx.expense.update({
      where: { id: expenseId },
      data: {
        title: merged.title,
        category: merged.category,
        notes: merged.notes,
        expenseDate: new Date(merged.expense_date),
        originalAmountMinor: merged.amount.minor,
        originalCurrency: ledger.originalCurrency,
        baseAmountMinor: ledger.baseAmountMinor,
        baseCurrency: ledger.baseCurrency,
        fxRate: ledger.fxRate,
        fxSource: ledger.fxSource,
        splitMethod: SplitMethod[merged.split_method.toUpperCase() as keyof typeof SplitMethod],
        receiptPath: merged.receipt_url,
      },
    });

    await tx.expensePayer.createMany({
      data: ledger.payers.map((payer) => ({
        expenseId,
        userId: payer.userId,
        originalPaidAmountMinor: payer.originalPaidAmountMinor,
        basePaidAmountMinor: payer.basePaidAmountMinor,
      })),
    });
    await tx.expenseSplit.createMany({
      data: ledger.splits.map((split) => ({
        expenseId,
        userId: split.userId,
        splitType: split.splitType,
        originalOwedAmountMinor: split.originalOwedAmountMinor,
        baseOwedAmountMinor: split.baseOwedAmountMinor,
        percentageBasisPoints: split.percentageBasisPoints,
        exactAmountMinor: split.exactAmountMinor,
      })),
    });

    await createActivityLog(tx, {
      groupId: expense.groupId,
      expenseId,
      actorUserId: userId,
      entityType: ActivityEntityType.EXPENSE,
      entityId: expenseId,
      action: 'expense_updated',
      payload: input,
    });

    return {
      expense: serializeExpense({
        ...nextExpense,
        payers: ledger.payers,
        splits: ledger.splits,
      }),
    };
  });

  return updated;
}

export async function deleteExpense(userId: string, expenseId: string) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw new NotFoundError('Expense not found');
  const { group, membership } = await requireMembership(userId, expense.groupId);
  ensureMutableGroup(group.status);
  if (!canEditExpense(userId, expense.createdByUserId, membership.role)) {
    throw new ForbiddenError('You cannot delete this expense');
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: RecordStatus.DELETED,
      deletedAt: new Date(),
    },
  });

  await createActivityLog(prisma, {
    groupId: expense.groupId,
    expenseId,
    actorUserId: userId,
    entityType: ActivityEntityType.EXPENSE,
    entityId: expenseId,
    action: 'expense_deleted',
  });
}

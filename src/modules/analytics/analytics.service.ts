import { MembershipStatus, RecordStatus } from '@prisma/client';

import { requireMembership } from '../../lib/group-access.js';
import { computeGroupBalances, loadGroupLedger } from '../../lib/ledger.js';
import { PremiumRequiredError } from '../../lib/errors.js';
import { prisma } from '../../prisma/client.js';

async function assertAdvancedAnalyticsAllowed(userId: string) {
  const entitlement = await prisma.entitlementState.findUnique({ where: { userId } });
  if (!entitlement?.isPremium) {
    throw new PremiumRequiredError('Advanced analytics require premium');
  }
}

function filterExpensesByRange<T extends { expenseDate: Date }>(items: T[], fromDate?: string, toDate?: string) {
  return items.filter((item) => {
    const value = item.expenseDate.getTime();
    if (fromDate && value < new Date(fromDate).getTime()) return false;
    if (toDate && value > new Date(toDate).getTime()) return false;
    return true;
  });
}

function bucketDate(date: Date, granularity: 'day' | 'week' | 'month') {
  const copy = new Date(date);
  if (granularity === 'week') {
    const day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() - day + 1);
  }
  if (granularity === 'month') {
    copy.setUTCDate(1);
  }
  return copy.toISOString().slice(0, 10);
}

export async function getSummary(userId: string, groupId: string, query: { from_date?: string; to_date?: string }) {
  await requireMembership(userId, groupId);
  const ledger = await loadGroupLedger(groupId);
  const expenses = filterExpensesByRange(ledger.expenses, query.from_date, query.to_date);
  const settlements = ledger.settlements.filter((item) => {
    const value = item.settlementDate.getTime();
    if (query.from_date && value < new Date(query.from_date).getTime()) return false;
    if (query.to_date && value > new Date(query.to_date).getTime()) return false;
    return true;
  });

  return {
    group_id: groupId,
    base_currency: ledger.group.baseCurrency,
    total_spend_base_minor: expenses.reduce((acc, expense) => acc + expense.baseAmountMinor, 0),
    total_settled_base_minor: settlements.reduce((acc, settlement) => acc + settlement.baseAmountMinor, 0),
    member_count: ledger.members.filter((member) => member.status === MembershipStatus.ACTIVE).length,
    expense_count: expenses.length,
  };
}

export async function getByMember(userId: string, groupId: string) {
  await requireMembership(userId, groupId);
  await assertAdvancedAnalyticsAllowed(userId);
  const ledger = await loadGroupLedger(groupId);
  const balances = computeGroupBalances(ledger);

  const items = ledger.members.map((member) => {
    const totalPaid = ledger.expenses
      .flatMap((expense) => expense.payers)
      .filter((payer) => payer.userId === member.userId)
      .reduce((acc, payer) => acc + payer.basePaidAmountMinor, 0);
    const totalOwed = ledger.expenses
      .flatMap((expense) => expense.splits)
      .filter((split) => split.userId === member.userId)
      .reduce((acc, split) => acc + split.baseOwedAmountMinor, 0);

    return {
      user_id: member.userId,
      display_name: member.user.displayName,
      total_paid_base_minor: totalPaid,
      total_owed_base_minor: totalOwed,
      net_base_amount_minor: balances.netBalances[member.userId] ?? 0,
    };
  });

  return { items };
}

export async function getByCategory(userId: string, groupId: string) {
  await requireMembership(userId, groupId);
  await assertAdvancedAnalyticsAllowed(userId);
  const items = await prisma.expense.groupBy({
    by: ['category'],
    where: {
      groupId,
      status: RecordStatus.ACTIVE,
    },
    _sum: {
      baseAmountMinor: true,
    },
  });

  return {
    items: items.map((item) => ({
      category: item.category ?? 'uncategorized',
      total_base_minor: item._sum.baseAmountMinor ?? 0,
    })),
  };
}

export async function getTimeline(
  userId: string,
  groupId: string,
  query: { granularity: 'day' | 'week' | 'month'; from_date?: string; to_date?: string },
) {
  await requireMembership(userId, groupId);
  await assertAdvancedAnalyticsAllowed(userId);
  const ledger = await loadGroupLedger(groupId);
  const expenses = filterExpensesByRange(ledger.expenses, query.from_date, query.to_date);
  const buckets = new Map<string, number>();

  for (const expense of expenses) {
    const key = bucketDate(expense.expenseDate, query.granularity);
    buckets.set(key, (buckets.get(key) ?? 0) + expense.baseAmountMinor);
  }

  return {
    items: [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([periodStart, total]) => ({
        period_start: periodStart,
        total_base_minor: total,
      })),
  };
}

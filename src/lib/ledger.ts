import { RecordStatus } from '@prisma/client';

import { prisma } from '../prisma/client.js';
import { simplifyDebts } from './balances.js';

export async function loadGroupLedger(groupId: string) {
  const [group, expenses, settlements, members] = await Promise.all([
    prisma.group.findUniqueOrThrow({ where: { id: groupId } }),
    prisma.expense.findMany({
      where: {
        groupId,
        status: RecordStatus.ACTIVE,
      },
      include: {
        payers: true,
        splits: true,
      },
    }),
    prisma.settlement.findMany({
      where: {
        groupId,
        status: RecordStatus.ACTIVE,
      },
    }),
    prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    }),
  ]);

  return { group, expenses, settlements, members };
}

export function computeGroupBalances(ledger: Awaited<ReturnType<typeof loadGroupLedger>>) {
  const netBalances: Record<string, number> = {};

  for (const member of ledger.members) {
    netBalances[member.userId] = 0;
  }

  for (const expense of ledger.expenses) {
    for (const payer of expense.payers) {
      netBalances[payer.userId] = (netBalances[payer.userId] ?? 0) + payer.basePaidAmountMinor;
    }
    for (const split of expense.splits) {
      netBalances[split.userId] = (netBalances[split.userId] ?? 0) - split.baseOwedAmountMinor;
    }
  }

  for (const settlement of ledger.settlements) {
    netBalances[settlement.fromUserId] = (netBalances[settlement.fromUserId] ?? 0) + settlement.baseAmountMinor;
    netBalances[settlement.toUserId] = (netBalances[settlement.toUserId] ?? 0) - settlement.baseAmountMinor;
  }

  const suggestions = simplifyDebts(netBalances);
  return {
    netBalances,
    obligations: suggestions,
    updatedAt: new Date(
      Math.max(
        0,
        ...ledger.expenses.map((expense) => expense.updatedAt.getTime()),
        ...ledger.settlements.map((settlement) => settlement.updatedAt.getTime()),
        ledger.group.updatedAt.getTime(),
      ),
    ),
  };
}

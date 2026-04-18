import { requireMembership } from '../../lib/group-access.js';
import { computeGroupBalances, loadGroupLedger } from '../../lib/ledger.js';

export async function getBalances(userId: string, groupId: string) {
  await requireMembership(userId, groupId);
  const ledger = await loadGroupLedger(groupId);
  const computed = computeGroupBalances(ledger);

  return {
    group_id: groupId,
    base_currency: ledger.group.baseCurrency,
    member_balances: Object.entries(computed.netBalances).map(([memberUserId, amount]) => ({
      user_id: memberUserId,
      net_base_amount_minor: amount,
    })),
    obligations: computed.obligations.map((obligation) => ({
      from_user_id: obligation.fromUserId,
      to_user_id: obligation.toUserId,
      base_amount_minor: obligation.amount,
    })),
    updated_at: computed.updatedAt.toISOString(),
  };
}

export async function getSimplifiedBalances(userId: string, groupId: string) {
  const balances = await getBalances(userId, groupId);
  return {
    group_id: balances.group_id,
    base_currency: balances.base_currency,
    suggestions: balances.obligations,
  };
}

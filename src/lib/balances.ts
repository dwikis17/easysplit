export type LedgerTransfer = {
  fromUserId: string;
  toUserId: string;
  amount: number;
};

export function simplifyDebts(netBalances: Record<string, number>) {
  const debtors = Object.entries(netBalances)
    .filter(([, amount]) => amount < 0)
    .map(([userId, amount]) => ({ userId, amount: Math.abs(amount) }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const creditors = Object.entries(netBalances)
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const suggestions: LedgerTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const settled = Math.min(debtor.amount, creditor.amount);

    suggestions.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amount: settled,
    });

    debtor.amount -= settled;
    creditor.amount -= settled;

    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return suggestions;
}

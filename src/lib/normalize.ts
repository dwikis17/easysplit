export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase();
}

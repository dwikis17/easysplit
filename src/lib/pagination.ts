export function parseCursorLimit(limit?: string | number, fallback = 20, max = 100) {
  const raw = typeof limit === 'string' ? Number(limit) : limit;
  const parsed = Number.isFinite(raw) ? Number(raw) : fallback;
  return Math.min(Math.max(parsed, 1), max);
}

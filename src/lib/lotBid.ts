/** Parse a rough USD amount from start price text (e.g. "100", "$1,200"). */
export function guessMinBidFromStartPrice(s: string | undefined): number {
  if (!s?.trim()) return 100;
  const m = s.replace(/,/g, "").match(/[\d.]+/);
  if (!m) return 100;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? Math.max(10, Math.floor(n)) : 100;
}

/**
 * Smallest index in the discrete price ladder whose value is >= parsed start price
 * (or >= fallbackFloor when start is missing).
 */
export function minPriceIndexFromStart(
  prices: number[],
  startPriceRaw: string | undefined,
  fallbackFloor: number,
): number {
  const n = startPriceRaw?.trim()
    ? guessMinBidFromStartPrice(startPriceRaw)
    : fallbackFloor;
  const i = prices.findIndex((p) => p >= n);
  return i >= 0 ? i : 0;
}

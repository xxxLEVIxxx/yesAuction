/** Parse a rough USD amount from start price text (e.g. "100", "$1,200"). */
export function guessMinBidFromStartPrice(s: string | undefined): number {
  if (!s?.trim()) return 100;
  const m = s.replace(/,/g, "").match(/[\d.]+/);
  if (!m) return 100;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? Math.max(25, Math.floor(n)) : 100;
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

/**
 * Smallest ladder index whose price is strictly greater than `aboveValue` (competitive floor).
 * If `aboveValue` is 0 or invalid, returns 0. If no rung is above, returns last index.
 */
export function minPriceIndexStrictlyAbove(prices: number[], aboveValue: number): number {
  if (prices.length === 0) return 0;
  if (!Number.isFinite(aboveValue) || aboveValue <= 0) return 0;
  const i = prices.findIndex((p) => p > aboveValue);
  if (i >= 0) return i;
  return prices.length - 1;
}

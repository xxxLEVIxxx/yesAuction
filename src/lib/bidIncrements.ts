/**
 * Increment for the next step on the pre-bid drum, by current bid amount (USD).
 * Matches auction house table: threshold "from" → increment until the next threshold.
 */
export function getBidIncrement(p: number): number {
  if (p < 500) return 25;
  if (p < 1000) return 50;
  if (p < 2000) return 100;
  if (p < 5000) return 250;
  if (p < 10000) return 500;
  if (p < 20000) return 1000;
  if (p < 50000) return 2000;
  if (p < 100000) return 5000;
  if (p < 200000) return 10000;
  if (p < 500000) return 20000;
  if (p < 1000000) return 50000;
  return 100000;
}

/** Discrete price ladder for the drum (inclusive of `start`, up to `max`). */
export function buildBidPriceLadder(max = 5_000_000, start = 25): number[] {
  const out: number[] = [];
  let p = start;
  while (p <= max) {
    out.push(p);
    p += getBidIncrement(p);
  }
  return out;
}

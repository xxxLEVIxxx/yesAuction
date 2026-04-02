import { DataSnapshot, get, ref, set } from "firebase/database";
import type { Database } from "firebase/database";

/** RTDB path segment for the aggregate max pre-bid amount per lot. */
export const LOT_PREBID_HIGH_PATH = "lotPrebidHigh";

export function parseLotPrebidHighSnap(snap: DataSnapshot): number {
  if (!snap.exists()) return 0;
  const v = snap.val();
  if (v && typeof v === "object" && "amount" in v) {
    const n = Number((v as { amount: unknown }).amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Max of all bidder `amount` fields under `itemBids/{lotId}` (live snapshot). */
export function maxAmountFromItemBidsSnapshot(snap: DataSnapshot): number {
  return leadingBidFromItemBidsSnapshot(snap).amount;
}

export type LeadingBidInfo = {
  amount: number;
  bidderNumber: number | null;
  userId: string | null;
};

function leadingBidIsBetter(cand: LeadingBidInfo, current: LeadingBidInfo): boolean {
  if (cand.amount !== current.amount) return cand.amount > current.amount;
  const cb = cand.bidderNumber ?? 0;
  const ib = current.bidderNumber ?? 0;
  if (cb !== ib) return cb > ib;
  if (!cand.userId || !current.userId) return false;
  return cand.userId.localeCompare(current.userId) < 0;
}

/**
 * Highest `amount` among children of `itemBids/{lotId}` and the winning row’s bidder number.
 * Ties: higher `bidderNumber` wins; then lexicographic `userId` for stability.
 */
export function leadingBidFromItemBidsSnapshot(snap: DataSnapshot): LeadingBidInfo {
  if (!snap.exists()) {
    return { amount: 0, bidderNumber: null, userId: null };
  }
  let best: LeadingBidInfo = { amount: 0, bidderNumber: null, userId: null };
  snap.forEach((child) => {
    const uid = child.key;
    const raw = child.val() as { amount?: unknown; bidderNumber?: unknown } | null;
    if (!raw || !uid) return;
    const a = raw.amount != null ? Number(raw.amount) : NaN;
    if (!Number.isFinite(a) || a <= 0) return;
    const bnRaw = raw.bidderNumber != null ? Number(raw.bidderNumber) : NaN;
    const bidderNum = Number.isFinite(bnRaw) && bnRaw > 0 ? Math.floor(bnRaw) : null;
    const cand: LeadingBidInfo = { amount: a, bidderNumber: bidderNum, userId: uid };
    if (leadingBidIsBetter(cand, best)) best = cand;
  });
  return best;
}

/** Max of all bidder amounts under itemBids for this lot. */
export async function maxAmountFromItemBids(db: Database, lotId: string): Promise<number> {
  const snap = await get(ref(db, `itemBids/${lotId}`));
  return maxAmountFromItemBidsSnapshot(snap);
}

/** Ensures lotPrebidHigh is at least the max from itemBids (legacy / repair). */
export async function syncLotPrebidHighFromItemBids(db: Database, lotId: string): Promise<void> {
  const [maxB, highSnap] = await Promise.all([
    maxAmountFromItemBids(db, lotId),
    get(ref(db, `${LOT_PREBID_HIGH_PATH}/${lotId}`)),
  ]);
  const stored = parseLotPrebidHighSnap(highSnap);
  if (maxB > stored) {
    await set(ref(db, `${LOT_PREBID_HIGH_PATH}/${lotId}`), {
      amount: maxB,
      updatedAt: Date.now(),
    });
  }
}

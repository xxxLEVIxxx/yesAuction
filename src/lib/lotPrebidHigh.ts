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
  if (!snap.exists()) return 0;
  let maxB = 0;
  snap.forEach((child) => {
    const raw = child.val() as { amount?: unknown } | null;
    const a = raw && raw.amount != null ? Number(raw.amount) : NaN;
    if (Number.isFinite(a) && a > maxB) maxB = a;
  });
  return maxB;
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

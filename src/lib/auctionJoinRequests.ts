/**
 * Firebase RTDB: auctionJoinRequests/{auctionId}/{userId}
 */

export type DepositStatus = "pending" | "waived" | "pay_required";

export type JoinRequestRecord = {
  userId: string;
  email: string;
  displayName: string;
  bidderNumber: number | null;
  auctionId: string;
  /** Denormalized for admin list */
  auctionTitle?: string;
  createdAt: number;
  updatedAt?: number;
  processed: boolean;
  processedAt: number | null;
  depositStatus: DepositStatus;
};

export type JoinRequestRow = JoinRequestRecord & { id: string };

export function parseJoinRequest(uid: string, raw: unknown): JoinRequestRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const depositRaw = o.depositStatus;
  const depositStatus: DepositStatus =
    depositRaw === "waived" || depositRaw === "pay_required" || depositRaw === "pending"
      ? depositRaw
      : "pending";
  return {
    id: uid,
    userId: String(o.userId ?? uid),
    email: String(o.email ?? ""),
    displayName: String(o.displayName ?? ""),
    bidderNumber: o.bidderNumber == null ? null : Number(o.bidderNumber),
    auctionId: String(o.auctionId ?? ""),
    auctionTitle: o.auctionTitle != null ? String(o.auctionTitle) : undefined,
    createdAt: Number(o.createdAt) || 0,
    updatedAt: o.updatedAt != null ? Number(o.updatedAt) : undefined,
    processed: o.processed === true,
    processedAt: o.processedAt == null ? null : Number(o.processedAt),
    depositStatus,
  };
}

export function parseJoinRequestsForAuction(val: unknown): JoinRequestRow[] {
  if (!val || typeof val !== "object") return [];
  const rows: JoinRequestRow[] = [];
  for (const [uid, raw] of Object.entries(val as Record<string, unknown>)) {
    const row = parseJoinRequest(uid, raw);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => a.createdAt - b.createdAt);
  return rows;
}

/** Full tree auctionJoinRequests -> { auctionId: { uid: record } } */
export function countPendingPerAuction(val: unknown): Record<string, { pending: number; total: number }> {
  const out: Record<string, { pending: number; total: number }> = {};
  if (!val || typeof val !== "object") return out;
  for (const [auctionId, users] of Object.entries(val as Record<string, unknown>)) {
    if (!users || typeof users !== "object") continue;
    let pending = 0;
    let total = 0;
    for (const raw of Object.values(users as Record<string, unknown>)) {
      const o = raw as Record<string, unknown>;
      total += 1;
      if (o.processed !== true) pending += 1;
    }
    out[auctionId] = { pending, total };
  }
  return out;
}

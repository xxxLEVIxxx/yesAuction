/** Shared lot list parsing / ordering for catalog + per-lot bid page navigation. */

export type AuctionLotRow = {
  id: string;
  auctionId?: string;
  roundId?: string;
  number?: string;
  title?: string;
  estimate?: string;
  lowEst?: string;
  highEst?: string;
  startPrice?: string;
  website?: string;
};

export function parseLotsTree(val: unknown): AuctionLotRow[] {
  if (!val || typeof val !== "object") return [];
  const out: AuctionLotRow[] = [];
  for (const [id, raw] of Object.entries(val as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    out.push({
      id,
      auctionId: typeof v.auctionId === "string" ? v.auctionId : undefined,
      roundId: typeof v.roundId === "string" ? v.roundId : undefined,
      number: v.number != null ? String(v.number) : undefined,
      title: v.title != null ? String(v.title) : undefined,
      estimate: v.estimate != null ? String(v.estimate) : undefined,
      lowEst: v.lowEst != null ? String(v.lowEst) : undefined,
      highEst: v.highEst != null ? String(v.highEst) : undefined,
      startPrice: v.startPrice != null ? String(v.startPrice) : undefined,
      website: v.website != null ? String(v.website) : undefined,
    });
  }
  return out;
}

export function sortLotsByNumber(a: AuctionLotRow, b: AuctionLotRow): number {
  return (a.number || "").localeCompare(b.number || "", undefined, { numeric: true });
}

/**
 * Firebase RTDB: auctions/rounds/{auctionId}/{roundId}
 * Each auction can have multiple rounds (e.g. Day 1, Day 2) with own time range & description.
 */

import { formatAuctionDate, fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/auctionCatalog";

export type AuctionRoundEntry = {
  /** e.g. "Day 1", "第 1 天", "上午场" */
  label: string;
  description: string;
  startAt: number;
  endAt: number | null;
  /** Sort order (lower first) */
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type AuctionRoundRow = AuctionRoundEntry & { id: string };

export function parseRoundRows(val: unknown): AuctionRoundRow[] {
  if (!val || typeof val !== "object") return [];
  const rows: AuctionRoundRow[] = [];
  for (const [id, raw] of Object.entries(val as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const label = String(o.label ?? "");
    const description = String(o.description ?? "");
    const startAt = Number(o.startAt);
    const endAt = o.endAt == null || o.endAt === "" ? null : Number(o.endAt);
    const order = Number(o.order) || 0;
    const createdAt = Number(o.createdAt) || 0;
    const updatedAt = Number(o.updatedAt) || 0;
    if (!label || !Number.isFinite(startAt)) continue;
    rows.push({
      id,
      label,
      description,
      startAt,
      endAt: endAt != null && Number.isFinite(endAt) ? endAt : null,
      order,
      createdAt,
      updatedAt,
    });
  }
  rows.sort((a, b) => a.order - b.order || a.startAt - b.startAt);
  return rows;
}

/** Parse full tree get(auctions/rounds) → map auctionId → rounds */
export function parseRoundsTree(val: unknown): Record<string, AuctionRoundRow[]> {
  const out: Record<string, AuctionRoundRow[]> = {};
  if (!val || typeof val !== "object") return out;
  for (const [auctionId, node] of Object.entries(val as Record<string, unknown>)) {
    out[auctionId] = parseRoundRows(node);
  }
  return out;
}

export function formatRoundTimeRange(r: Pick<AuctionRoundRow, "startAt" | "endAt">): string {
  const a = formatAuctionDate(r.startAt);
  if (r.endAt != null && r.endAt > 0) {
    return `${a} — ${formatAuctionDate(r.endAt)}`;
  }
  return a;
}

export { toDateTimeLocalValue, fromDateTimeLocalValue };

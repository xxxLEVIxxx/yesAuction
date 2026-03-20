/**
 * Firebase RTDB: auctions/catalog/{auctionId}
 * Lots (optional, add later): auctions/lots/{lotId} with { auctionId, number, title, estimate, ... }
 */

export type AuctionCatalogStatus = "draft" | "scheduled" | "live" | "ended";

export type AuctionCatalogEntry = {
  title: string;
  summary: string;
  description: string;
  /** Start date/time (ms since epoch) */
  startAt: number;
  /** Optional end (ms) */
  endAt?: number | null;
  status: AuctionCatalogStatus;
  createdAt: number;
  updatedAt: number;
};

export type AuctionCatalogRow = AuctionCatalogEntry & { id: string };

export function isPublicAuction(a: AuctionCatalogEntry): boolean {
  return a.status !== "draft";
}

/** Past = ended, past end time, or scheduled with start time already passed (live stays until ended) */
export function isPastAuction(a: AuctionCatalogEntry, now = Date.now()): boolean {
  if (a.status === "ended") return true;
  if (a.endAt != null && a.endAt > 0 && a.endAt < now) return true;
  if (a.status === "live") return false;
  if (a.status === "scheduled" && a.startAt < now) return true;
  return false;
}

/** Upcoming = visible on site, not past */
export function isUpcomingAuction(a: AuctionCatalogEntry, now = Date.now()): boolean {
  if (a.status === "draft") return false;
  if (isPastAuction(a, now)) return false;
  return true;
}

export function parseCatalogRows(val: unknown): AuctionCatalogRow[] {
  if (!val || typeof val !== "object") return [];
  const rows: AuctionCatalogRow[] = [];
  for (const [id, raw] of Object.entries(val as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const title = String(o.title ?? "");
    const summary = String(o.summary ?? "");
    const description = String(o.description ?? "");
    const startAt = Number(o.startAt);
    const endAt = o.endAt == null || o.endAt === "" ? null : Number(o.endAt);
    const allowed: AuctionCatalogStatus[] = ["draft", "scheduled", "live", "ended"];
    const rawStatus = o.status as string | undefined;
    const status: AuctionCatalogStatus =
      rawStatus && (allowed as string[]).includes(rawStatus) ? (rawStatus as AuctionCatalogStatus) : "scheduled";
    const createdAt = Number(o.createdAt) || 0;
    const updatedAt = Number(o.updatedAt) || 0;
    if (!title || !Number.isFinite(startAt)) continue;
    rows.push({
      id,
      title,
      summary,
      description,
      startAt,
      endAt: Number.isFinite(endAt as number) ? endAt : null,
      status,
      createdAt,
      updatedAt,
    });
  }
  return rows;
}

export function formatAuctionDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function toDateTimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalValue(s: string): number {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

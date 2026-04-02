import type { AuctionRoundRow } from "@/lib/auctionRounds";
import { formatRoundTimeRange } from "@/lib/auctionRounds";

export type AuctionRoundsBlockProps = {
  rounds: AuctionRoundRow[] | undefined;
  /** Appended after the formatted time range (e.g. timezone note). */
  timeSuffix?: string;
  /** Override display label per row (e.g. /links page). */
  mapRoundLabel?: (label: string) => string;
};

export function AuctionRoundsBlock({ rounds, timeSuffix, mapRoundLabel }: AuctionRoundsBlockProps) {
  if (!rounds?.length) return null;
  return (
    <ul className="auction-catalog-rounds">
      {rounds.map((r) => {
        const label = mapRoundLabel ? mapRoundLabel(r.label) : r.label;
        const timeStr = formatRoundTimeRange(r) + (timeSuffix ?? "");
        return (
          <li key={r.id} className="auction-catalog-round">
            <div className="auction-catalog-round-line">
              <span className="auction-catalog-round-label">{label}</span>
              <span className="auction-catalog-round-time">{timeStr}</span>
            </div>
            {r.description ? <p className="auction-catalog-round-desc">{r.description}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

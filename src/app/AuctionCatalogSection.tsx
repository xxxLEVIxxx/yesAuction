"use client";

import type { User } from "firebase/auth";
import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "@/lib/firebase";
import { JoinAuctionButton } from "@/components/JoinAuctionButton";
import {
  isPastAuction,
  isPublicAuction,
  isUpcomingAuction,
  parseCatalogRows,
  type AuctionCatalogRow,
} from "@/lib/auctionCatalog";

const MAIN_AUCTION_SITE = process.env.NEXT_PUBLIC_MAIN_SITE_URL?.trim() || "https://theyesauction.com";
import type { AuctionRoundRow } from "@/lib/auctionRounds";
import { formatRoundTimeRange, parseRoundsTree } from "@/lib/auctionRounds";

type Props = {
  user: User | null;
  authLoading: boolean;
};

export function AuctionCatalogSection({ user, authLoading }: Props) {
  const [upcoming, setUpcoming] = useState<AuctionCatalogRow[]>([]);
  const [past, setPast] = useState<AuctionCatalogRow[]>([]);
  const [roundsByAuction, setRoundsByAuction] = useState<Record<string, AuctionRoundRow[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catSnap, roundsSnap] = await Promise.all([
          get(ref(db, "auctions/catalog")),
          get(ref(db, "auctions/rounds")),
        ]);
        if (cancelled) return;
        setRoundsByAuction(parseRoundsTree(roundsSnap.val()));
        const all = parseCatalogRows(catSnap.val()).filter(isPublicAuction);
        const now = Date.now();
        const up = all.filter((a) => isUpcomingAuction(a, now)).sort((a, b) => a.startAt - b.startAt);
        const pa = all.filter((a) => isPastAuction(a, now)).sort((a, b) => b.startAt - a.startAt);
        setUpcoming(up);
        setPast(pa);
      } catch {
        if (!cancelled) {
          setUpcoming([]);
          setPast([]);
          setRoundsByAuction({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="auction-catalog-section" aria-busy="true">
        <p className="admin-muted auction-catalog-loading">加载场次信息…</p>
      </section>
    );
  }

  if (upcoming.length === 0 && past.length === 0) {
    return null;
  }

  return (
    <section className="auction-catalog-section" aria-label="拍卖场次">
      {upcoming.length > 0 ? (
        <div className="auction-catalog-block">
          <h2 className="auction-catalog-heading">即将开始</h2>
          <ul className="auction-catalog-list">
            {upcoming.map((a) => (
              <li key={a.id} className="auction-catalog-item">
                <div className="auction-catalog-item-head">
                  <span className="auction-catalog-item-title">{a.title}</span>
                  <a
                    href={MAIN_AUCTION_SITE}
                    className="auction-catalog-item-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    官网拍品目录
                  </a>
                  {a.status === "live" ? <span className="auction-catalog-live">LIVE</span> : null}
                </div>
                {a.summary ? <p className="auction-catalog-summary">{a.summary}</p> : null}
                <AuctionRoundsBlock rounds={roundsByAuction[a.id]} />
                {a.description ? <p className="auction-catalog-desc">{a.description}</p> : null}
                <JoinAuctionButton
                  auctionId={a.id}
                  auctionTitle={a.title}
                  user={user}
                  authLoading={authLoading}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="auction-catalog-block">
          <h2 className="auction-catalog-heading">往期场次</h2>
          <ul className="auction-catalog-list">
            {past.map((a) => (
              <li key={a.id} className="auction-catalog-item muted">
                <div className="auction-catalog-item-head">
                  <span className="auction-catalog-item-title">{a.title}</span>
                  <a
                    href={MAIN_AUCTION_SITE}
                    className="auction-catalog-item-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    官网拍品目录
                  </a>
                </div>
                {a.summary ? <p className="auction-catalog-summary">{a.summary}</p> : null}
                <AuctionRoundsBlock rounds={roundsByAuction[a.id]} />
                {a.description ? <p className="auction-catalog-desc">{a.description}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function AuctionRoundsBlock({ rounds }: { rounds: AuctionRoundRow[] | undefined }) {
  if (!rounds?.length) return null;
  return (
    <ul className="auction-catalog-rounds">
      {rounds.map((r) => (
        <li key={r.id} className="auction-catalog-round">
          <div className="auction-catalog-round-line">
            <span className="auction-catalog-round-label">{r.label}</span>
            <span className="auction-catalog-round-time">{formatRoundTimeRange(r)}</span>
          </div>
          {r.description ? <p className="auction-catalog-round-desc">{r.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}

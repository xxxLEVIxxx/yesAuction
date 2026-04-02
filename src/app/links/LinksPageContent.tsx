"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { AuctionRoundsBlock } from "@/components/AuctionRoundsBlock";
import { db } from "@/lib/firebase";
import {
  isPastAuction,
  isPublicAuction,
  isUpcomingAuction,
  parseCatalogRows,
  type AuctionCatalogRow,
} from "@/lib/auctionCatalog";
import type { AuctionRoundRow } from "@/lib/auctionRounds";
import { parseRoundsTree } from "@/lib/auctionRounds";
import { PUBLIC_LINKS } from "@/lib/publicLinks";

const MAIN_AUCTION_SITE = process.env.NEXT_PUBLIC_MAIN_SITE_URL?.trim() || "https://theyesauction.com";

/** Shown after each round’s time range on /links only. */
const LINKS_ROUND_TIME_SUFFIX = "（美国纽约时间EDT）";

/** Map admin round labels that use 4/10、4/11 dates to 专场名称（仅 /links） */
function mapLinkPageRoundLabel(label: string): string {
  if (/4\s*月\s*10\s*日|04\s*月\s*10\s*日/.test(label)) return "瓷器专场";
  if (/4\s*月\s*11\s*日|04\s*月\s*11\s*日/.test(label)) return "书画玉器杂项专场";
  return label;
}

function normalizeHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function LinksPageContent() {
  const [upcoming, setUpcoming] = useState<AuctionCatalogRow[]>([]);
  const [past, setPast] = useState<AuctionCatalogRow[]>([]);
  const [roundsByAuction, setRoundsByAuction] = useState<Record<string, AuctionRoundRow[]>>({});
  const [catalogLoading, setCatalogLoading] = useState(true);

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
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="header">
        <Link href="/" className="back-link">
          ← 拍卖首页
        </Link>
        <div className="logo">
          YES <em>AUCTION</em>
        </div>
        <div className="header-spacer" aria-hidden />
      </header>

      <main className="wrap links-hub">
        <div className="links-hub-intro">
          <div className="auction-hero links-hub-hero">
            <p className="auction-hero-tag">YES AUCTION</p>
            <h1 className="auction-hero-title links-hub-hero-title">合作平台入口</h1>
            <p className="auction-hero-sub">外部参拍链接 · 与首页场次信息同步</p>
          </div>
        </div>

        <section className="auction-catalog-section links-hub-catalog" aria-label="拍卖场次">
          {catalogLoading ? (
            <p className="admin-muted auction-catalog-loading">加载场次信息…</p>
          ) : upcoming.length === 0 && past.length === 0 ? (
            <p className="sec-sub" style={{ textAlign: "center" }}>
              暂无公开场次信息。请稍后再试或联系 info@theyesauction.com。
            </p>
          ) : (
            <>
              {upcoming.length > 0 ? (
                <div className="auction-catalog-block">
                  <h2 className="auction-catalog-heading">即将开始</h2>
                  <ul className="auction-catalog-list">
                    {upcoming.map((a) => (
                      <li key={a.id} className="auction-catalog-item">
                        <div className="auction-catalog-item-head">
                          <span className="auction-catalog-item-title">{a.title}</span>
                          <span className="auction-catalog-item-actions">
                            <a
                              href={MAIN_AUCTION_SITE}
                              className="auction-catalog-item-link"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              官网拍品目录
                            </a>
                          </span>
                          {a.status === "live" ? <span className="auction-catalog-live">LIVE</span> : null}
                        </div>
                        {a.summary ? <p className="auction-catalog-summary">{a.summary}</p> : null}
                        <AuctionRoundsBlock
                          rounds={roundsByAuction[a.id]}
                          timeSuffix={LINKS_ROUND_TIME_SUFFIX}
                          mapRoundLabel={mapLinkPageRoundLabel}
                        />
                        {a.description ? <p className="auction-catalog-desc">{a.description}</p> : null}
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
                          <span className="auction-catalog-item-actions">
                            <a
                              href={MAIN_AUCTION_SITE}
                              className="auction-catalog-item-link"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              官网拍品目录
                            </a>
                          </span>
                        </div>
                        {a.summary ? <p className="auction-catalog-summary">{a.summary}</p> : null}
                        <AuctionRoundsBlock
                          rounds={roundsByAuction[a.id]}
                          timeSuffix={LINKS_ROUND_TIME_SUFFIX}
                          mapRoundLabel={mapLinkPageRoundLabel}
                        />
                        {a.description ? <p className="auction-catalog-desc">{a.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </section>

        <h2 className="links-hub-platforms-title">合作拍卖平台</h2>
        <p className="sec-sub links-hub-sub links-hub-sub--tight">
          点击下方按钮在新窗口打开对应平台（无需登录本站）。
        </p>

        <ul className="links-hub-list" role="list">
          {PUBLIC_LINKS.map((item) => {
            const href = normalizeHref(item.href);
            const ready = href.length > 0;
            return (
              <li key={item.id} className="links-hub-item">
                {ready ? (
                  <a className="links-hub-btn" href={href} target="_blank" rel="noopener noreferrer">
                    <span className="links-hub-btn-text-wrap">
                      <span className="links-hub-btn-label">{item.label}</span>
                      {item.subLabel ? <span className="links-hub-btn-sublabel">{item.subLabel}</span> : null}
                    </span>
                    <span className="links-hub-btn-arrow" aria-hidden>
                      ↗
                    </span>
                  </a>
                ) : (
                  <div className="links-hub-btn links-hub-btn--pending">
                    <span className="links-hub-btn-text-wrap">
                      <span className="links-hub-btn-label">{item.label}</span>
                      {item.subLabel ? <span className="links-hub-btn-sublabel">{item.subLabel}</span> : null}
                    </span>
                    <span className="links-hub-btn-pending">链接待更新</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="sec-sub links-hub-footnote">
          链接由本站维护；若某平台暂未配置，请稍后再试或联系 info@theyesauction.com。
        </p>
      </main>
    </>
  );
}

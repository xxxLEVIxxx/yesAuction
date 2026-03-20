"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { get, onValue, ref } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import {
  formatAuctionDate,
  parseCatalogRows,
  type AuctionCatalogRow,
} from "@/lib/auctionCatalog";
import { parseRoundRows, type AuctionRoundRow } from "@/lib/auctionRounds";
import { buildEstimate } from "@/lib/importLotsFromSpreadsheet";

type LotRow = {
  id: string;
  auctionId?: string;
  roundId?: string;
  number?: string;
  title?: string;
  estimate?: string;
  lowEst?: string;
  highEst?: string;
  startPrice?: string;
  /** Product / description page from import (website column) */
  website?: string;
};

const UNASSIGNED_TAB = "__unassigned__";

function displayEstimate(l: LotRow): string {
  const e = l.estimate?.trim();
  if (e) return e;
  return buildEstimate(l.lowEst?.trim() || "", l.highEst?.trim() || "", "");
}

function parseLotsTree(val: unknown): LotRow[] {
  if (!val || typeof val !== "object") return [];
  const out: LotRow[] = [];
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

function externalHref(url: string): string {
  const t = url.trim();
  if (!t) return "#";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function sortLots(a: LotRow, b: LotRow): number {
  return (a.number || "").localeCompare(b.number || "", undefined, { numeric: true });
}

function lotMatchesQuery(l: LotRow, q: string): boolean {
  if (!q.trim()) return true;
  const hay = [
    l.number,
    l.title,
    displayEstimate(l),
    l.startPrice,
    l.lowEst,
    l.highEst,
    l.website,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tokens = q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

export function AuctionLotsCatalogClient() {
  const params = useParams();
  const auctionId = typeof params?.auctionId === "string" ? params.auctionId : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [auction, setAuction] = useState<AuctionCatalogRow | null>(null);
  const [rounds, setRounds] = useState<AuctionRoundRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  /** lotId → user has a proxy bid on this lot */
  const [userBidOnLot, setUserBidOnLot] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setAuthUser);
    return () => unsub();
  }, []);

  const lotIdsKey = useMemo(() => lots.map((l) => l.id).sort().join(","), [lots]);

  /** Live `itemBids/{lotId}/{uid}/amount` — shows 已出价 when amount > 0 */
  useEffect(() => {
    if (!authUser?.uid || lots.length === 0) {
      setUserBidOnLot({});
      return;
    }
    const uid = authUser.uid;
    const unsubs: (() => void)[] = [];
    for (const l of lots) {
      const amountRef = ref(db, `itemBids/${l.id}/${uid}/amount`);
      unsubs.push(
        onValue(amountRef, (snap) => {
          const v = snap.exists() ? Number(snap.val()) : 0;
          const has = Number.isFinite(v) && v > 0;
          setUserBidOnLot((prev) => ({ ...prev, [l.id]: has }));
        }),
      );
    }
    return () => {
      unsubs.forEach((u) => u());
      setUserBidOnLot({});
    };
  }, [authUser?.uid, lotIdsKey, lots]);

  useEffect(() => {
    if (!auctionId) {
      setLoading(false);
      setErr("无效的场次 ID");
      return;
    }
    let cancelled = false;
    (async () => {
      setErr("");
      setLoading(true);
      try {
        const [catSnap, roundsSnap, lotsSnap] = await Promise.all([
          get(ref(db, `auctions/catalog/${auctionId}`)),
          get(ref(db, `auctions/rounds/${auctionId}`)),
          get(ref(db, "auctions/lots")),
        ]);
        if (cancelled) return;

        const catVal = catSnap.val();
        if (!catVal || typeof catVal !== "object") {
          setAuction(null);
          setErr("未找到该拍卖场次");
          return;
        }
        const rows = parseCatalogRows({ [auctionId]: catVal });
        const row = rows[0];
        if (!row) {
          setAuction(null);
          setErr("未找到该拍卖场次");
          return;
        }
        setAuction(row);

        const rs = parseRoundRows(roundsSnap.val());
        setRounds(rs);

        const all = parseLotsTree(lotsSnap.val()).filter((l) => l.auctionId === auctionId);
        all.sort(sortLots);
        setLots(all);

        const roundIds = new Set(rs.map((r) => r.id));
        const hasUnassigned = all.some(
          (l) => l.roundId === undefined || l.roundId === "" || !roundIds.has(l.roundId),
        );
        if (rs.length > 0) {
          const firstWithLots = rs.find((r) => all.some((l) => l.roundId === r.id));
          if (firstWithLots) setActiveTab(firstWithLots.id);
          else if (hasUnassigned) setActiveTab(UNASSIGNED_TAB);
          else setActiveTab(rs[0].id);
        } else {
          setActiveTab("");
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auctionId]);

  const roundIdSet = useMemo(() => new Set(rounds.map((r) => r.id)), [rounds]);

  const tabIds = useMemo(() => {
    const ids = rounds.map((r) => r.id);
    const hasUnassigned = lots.some(
      (l) => l.roundId === undefined || l.roundId === "" || !roundIdSet.has(l.roundId),
    );
    if (hasUnassigned) ids.push(UNASSIGNED_TAB);
    return ids;
  }, [rounds, lots, roundIdSet]);

  useEffect(() => {
    if (!activeTab) return;
    if (tabIds.length > 0 && !tabIds.includes(activeTab)) {
      setActiveTab(tabIds[0]);
    }
  }, [tabIds, activeTab]);

  const lotsInTab = useMemo(() => {
    if (rounds.length === 0) {
      return lots;
    }
    if (activeTab === UNASSIGNED_TAB) {
      return lots.filter(
        (l) => l.roundId === undefined || l.roundId === "" || !roundIdSet.has(l.roundId),
      );
    }
    return lots.filter((l) => l.roundId === activeTab);
  }, [lots, activeTab, rounds.length, roundIdSet]);

  const filteredLots = useMemo(() => {
    return lotsInTab.filter((l) => lotMatchesQuery(l, search));
  }, [lotsInTab, search]);

  function focusSearch() {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }

  if (!auctionId) {
    return (
      <main className="wrap auction-home">
        <p className="error">无效的链接</p>
        <Link href="/">返回首页</Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="wrap auction-home">
        <p className="admin-muted" style={{ textAlign: "center", marginTop: 40 }}>
          加载拍品目录…
        </p>
      </main>
    );
  }

  if (err || !auction) {
    return (
      <main className="wrap auction-home">
        <p className="error" style={{ marginBottom: 12 }}>
          {err || "未找到场次"}
        </p>
        <Link href="/">返回首页</Link>
      </main>
    );
  }

  return (
    <>
      <header className="header">
        <Link href="/" className="back-link">
          ← 首页
        </Link>
        <div className="logo">
          YES <em>AUCTION</em>
        </div>
        <div className="header-spacer" aria-hidden />
      </header>

      <main className="wrap auction-home auction-lots-catalog">
        <div className="auction-lots-catalog-head">
          <p className="auction-hero-tag">CATALOG</p>
          <h1 className="auction-hero-title" style={{ fontSize: "clamp(1.25rem, 4vw, 1.75rem)" }}>
            {auction.title}
          </h1>
          <p className="auction-catalog-item-meta" style={{ marginTop: 6 }}>
            {formatAuctionDate(auction.startAt)}
            {auction.status === "live" ? (
              <span className="auction-catalog-live" style={{ marginLeft: 8 }}>
                LIVE
              </span>
            ) : null}
          </p>
        </div>

        <div className="auction-lots-search-row">
          <label className="auction-lots-search-label">
            <span className="visually-hidden">搜索</span>
            <input
              ref={searchInputRef}
              type="search"
              className="auction-lots-search-input"
              placeholder="快速搜索：LOT、标题、估价、起拍价…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button type="button" className="btn auction-lots-search-btn" onClick={focusSearch}>
            搜索
          </button>
        </div>

        {rounds.length > 0 ? (
          <div className="auction-lots-tabs" role="tablist" aria-label="拍卖轮次">
            {rounds.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={activeTab === r.id}
                className={`auction-lots-tab ${activeTab === r.id ? "is-active" : ""}`}
                onClick={() => setActiveTab(r.id)}
              >
                {r.label}
              </button>
            ))}
            {tabIds.includes(UNASSIGNED_TAB) ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === UNASSIGNED_TAB}
                className={`auction-lots-tab ${activeTab === UNASSIGNED_TAB ? "is-active" : ""}`}
                onClick={() => setActiveTab(UNASSIGNED_TAB)}
              >
                未分轮次
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="auction-lots-count">
          共 <strong>{filteredLots.length}</strong> 件
          {search.trim() ? <span className="auction-lots-count-filter">（已筛选）</span> : null}
        </div>

        {filteredLots.length === 0 ? (
          <p className="admin-muted" style={{ marginTop: 16 }}>
            {lotsInTab.length === 0 ? "该轮次暂无拍品。" : "没有符合搜索条件的拍品。"}
          </p>
        ) : (
          <ul className="auction-lots-list">
            {filteredLots.map((l) => (
              <li key={l.id} className="auction-lots-item">
                <Link
                  href={`/auction/${auctionId}/lot/${l.id}`}
                  className="auction-lots-item-link"
                >
                  <div className="auction-lots-item-top">
                    <div className="auction-lots-item-left">
                      <span className="auction-lots-lotnum">LOT {l.number || "—"}</span>
                      {authUser && userBidOnLot[l.id] ? (
                        <span className="auction-lots-bid-badge">已出价</span>
                      ) : null}
                    </div>
                    <span className="auction-lots-start">起拍 {l.startPrice?.trim() || "—"}</span>
                  </div>
                  <h2 className="auction-lots-title">{l.title || "—"}</h2>
                  <p className="auction-lots-estimate">
                    估价 <span>{displayEstimate(l) || "—"}</span>
                  </p>
                  <span className="auction-lots-item-cta">代理出价 →</span>
                </Link>
                {l.website?.trim() ? (
                  <a
                    href={externalHref(l.website)}
                    className="auction-lots-item-desc-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    官网描述
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

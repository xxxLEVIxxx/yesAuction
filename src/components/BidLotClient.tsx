"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, onValue, push, ref, runTransaction, update } from "firebase/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { JoinAuctionButton } from "@/components/JoinAuctionButton";
import { parseJoinRequest, type JoinRequestRow } from "@/lib/auctionJoinRequests";
import { buildEstimate } from "@/lib/importLotsFromSpreadsheet";
import { buildBidPriceLadder, getBidIncrement } from "@/lib/bidIncrements";
import { minPriceIndexFromStart, minPriceIndexStrictlyAbove } from "@/lib/lotBid";
import { parseLotsTree, sortLotsByNumber, type AuctionLotRow } from "@/lib/auctionLots";
import {
  LOT_PREBID_HIGH_PATH,
  leadingBidFromItemBidsSnapshot,
  parseLotPrebidHighSnap,
  syncLotPrebidHighFromItemBids,
} from "@/lib/lotPrebidHigh";

type Lot = {
  id?: string;
  auctionId?: string;
  number?: string;
  title?: string;
  estimate?: string;
  lowEst?: string;
  highEst?: string;
  startPrice?: string;
};

function displayEstimate(l: Lot): string {
  const e = l.estimate?.trim();
  if (e) return e;
  return buildEstimate(l.lowEst?.trim() || "", l.highEst?.trim() || "", "");
}

export function fmt(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
  return `$${Number(n).toLocaleString("en-US")}`;
}

export type BidLotClientProps = {
  /** From URL query or route; `null` = use `auctions/current`. */
  resolvedLotId: string | null;
  /** Default floor for price drum before lot loads. */
  initialMinBid?: number;
  /** If set, loaded lot must belong to this auction. */
  expectedAuctionId?: string;
  /** Used for register `return=` (path + optional query). */
  returnPath: string;
  backHref: string;
  backLabel: string;
};

export function BidLotClient({
  resolvedLotId,
  initialMinBid = 100,
  expectedAuctionId,
  returnPath,
  backHref,
  backLabel,
}: BidLotClientProps) {
  const router = useRouter();
  const prices = useMemo(() => buildBidPriceLadder(), []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const drumRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [bidderNumber, setBidderNumber] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");
  /** Current pre-bid max from RTDB `itemBids/{lotId}/{uid}/amount` */
  const [existingBidAmount, setExistingBidAmount] = useState<number | null>(null);
  /** Max from `lotPrebidHigh` (aggregate), live-updated. */
  const [globalHighAmount, setGlobalHighAmount] = useState(0);
  /** Max from all rows under `itemBids/{lotId}` (source of truth for display if aggregate lags or is blocked). */
  const [itemBidsMaxAll, setItemBidsMaxAll] = useState(0);
  /** Leading bidder uid from `itemBids` (highest amount row). */
  const [leadingBidUid, setLeadingBidUid] = useState<string | null>(null);
  /** `bidderNumber` stored on the bid row (often null if not copied at submit time). */
  const [bnFromBidPayload, setBnFromBidPayload] = useState<number | null>(null);
  /** From `auctionJoinRequests/{auctionId}/{uid}.bidderNumber` (authoritative after join). */
  const [bnFromJoinRequest, setBnFromJoinRequest] = useState<number | null>(null);
  /** From `users/{uid}/bidderNumber` (canonical assignment). */
  const [bnFromUserProfile, setBnFromUserProfile] = useState<number | null>(null);
  const [neighborPrev, setNeighborPrev] = useState<AuctionLotRow | null>(null);
  const [neighborNext, setNeighborNext] = useState<AuctionLotRow | null>(null);

  /** Shown as「当前全场最高」and used for competitive floor (max of aggregate + itemBids scan). */
  const fieldHighEffective = useMemo(
    () => Math.max(globalHighAmount, itemBidsMaxAll),
    [globalHighAmount, itemBidsMaxAll],
  );
  const [bidFetchDone, setBidFetchDone] = useState(false);
  /** Show drum (true) vs summary line (false when already have a bid). */
  const [editingBid, setEditingBid] = useState(true);
  const bidUiInitRef = useRef(false);
  const [activeLotId, setActiveLotId] = useState<string | null>(resolvedLotId);
  const [lot, setLot] = useState<Lot | null>(null);
  const [lotNotFound, setLotNotFound] = useState(false);
  const [lotMismatch, setLotMismatch] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [animateDrum, setAnimateDrum] = useState(false);
  const [joinRequest, setJoinRequest] = useState<JoinRequestRow | null>(null);
  const [joinReady, setJoinReady] = useState(false);
  const [auctionTitleForJoin, setAuctionTitleForJoin] = useState("");
  const dragRef = useRef({
    dragging: false,
    startY: 0,
    startIdx: 0,
    lastY: 0,
    vel: 0,
  });
  /** Measured from DOM — CSS uses 50px desktop / 44px mobile; JS must match or drag & transform break on phones. */
  const [drumMetrics, setDrumMetrics] = useState({ wrapH: 272, itemH: 50 });
  const PAD = 3;

  const minSelectableIdx = useMemo(
    () => minPriceIndexFromStart(prices, lot?.startPrice, initialMinBid),
    [prices, lot, initialMinBid],
  );

  /** First ladder step strictly above the current max pre-bid among all bidders. */
  const competitiveFloorIdx = useMemo(
    () => minPriceIndexStrictlyAbove(prices, fieldHighEffective),
    [prices, fieldHighEffective],
  );

  /** Drum floor: start price, global competitive high, and own current bid (pre-bids can only go up). */
  const drumMinIdx = useMemo(() => {
    let m = Math.max(minSelectableIdx, competitiveFloorIdx);
    if (editingBid && existingBidAmount != null && existingBidAmount > 0) {
      const i = prices.findIndex((p) => p >= existingBidAmount);
      if (i >= 0) m = Math.max(m, i);
    }
    return m;
  }, [minSelectableIdx, competitiveFloorIdx, prices, editingBid, existingBidAmount]);

  useEffect(() => {
    if (!activeLotId) {
      setGlobalHighAmount(0);
      return;
    }
    const highRef = ref(db, `${LOT_PREBID_HIGH_PATH}/${activeLotId}`);
    const unsub = onValue(highRef, (snap) => {
      setGlobalHighAmount(parseLotPrebidHighSnap(snap));
    });
    return () => unsub();
  }, [activeLotId]);

  /** Live max across all bidders + leading bidder uid / payload 竞拍号. */
  useEffect(() => {
    if (!activeLotId) {
      setItemBidsMaxAll(0);
      setLeadingBidUid(null);
      setBnFromBidPayload(null);
      return;
    }
    const bidsRef = ref(db, `itemBids/${activeLotId}`);
    const unsub = onValue(bidsRef, (snap) => {
      const lead = leadingBidFromItemBidsSnapshot(snap);
      setItemBidsMaxAll(lead.amount);
      setLeadingBidUid(lead.userId);
      setBnFromBidPayload(lead.bidderNumber);
    });
    return () => unsub();
  }, [activeLotId]);

  /** Same auction: previous / next lot by LOT number (matches catalog order). */
  useEffect(() => {
    if (!expectedAuctionId || !resolvedLotId) {
      setNeighborPrev(null);
      setNeighborNext(null);
      return;
    }
    let cancelled = false;
    get(ref(db, "auctions/lots"))
      .then((snap) => {
        if (cancelled) return;
        const all = parseLotsTree(snap.val()).filter((l) => l.auctionId === expectedAuctionId);
        all.sort(sortLotsByNumber);
        const idx = all.findIndex((l) => l.id === resolvedLotId);
        if (idx < 0) {
          setNeighborPrev(null);
          setNeighborNext(null);
          return;
        }
        setNeighborPrev(idx > 0 ? all[idx - 1] : null);
        setNeighborNext(idx < all.length - 1 ? all[idx + 1] : null);
      })
      .catch(() => {
        if (!cancelled) {
          setNeighborPrev(null);
          setNeighborNext(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [expectedAuctionId, resolvedLotId]);

  /** Repair aggregate from `itemBids` if `lotPrebidHigh` was missing (legacy data). */
  useEffect(() => {
    if (!activeLotId) return;
    syncLotPrebidHighFromItemBids(db, activeLotId).catch(() => {});
  }, [activeLotId]);

  useEffect(() => {
    setSelectedIdx((prev) => Math.max(drumMinIdx, prev));
  }, [drumMinIdx]);

  /** Clamped index so drum highlight, summary, and submit always agree (same as visible row). */
  const effectiveIdx = useMemo(() => {
    if (prices.length === 0) return 0;
    return Math.min(Math.max(selectedIdx, drumMinIdx), prices.length - 1);
  }, [selectedIdx, drumMinIdx, prices.length]);

  useEffect(() => {
    if (effectiveIdx !== selectedIdx) {
      setSelectedIdx(effectiveIdx);
    }
  }, [effectiveIdx, selectedIdx]);

  useEffect(() => {
    bidUiInitRef.current = false;
  }, [activeLotId]);

  const auctionIdForJoin = useMemo(
    () => (lot?.auctionId || expectedAuctionId || "").trim(),
    [lot?.auctionId, expectedAuctionId],
  );

  const displayLeadingBidderNumber = useMemo(
    () => bnFromBidPayload ?? bnFromJoinRequest ?? bnFromUserProfile,
    [bnFromBidPayload, bnFromJoinRequest, bnFromUserProfile],
  );

  /** Resolve 竞拍号 from join request when missing on bid payload (same path as JoinAuctionButton). */
  useEffect(() => {
    if (!leadingBidUid || !auctionIdForJoin) {
      setBnFromJoinRequest(null);
      return;
    }
    const r = ref(db, `auctionJoinRequests/${auctionIdForJoin}/${leadingBidUid}`);
    const unsub = onValue(r, (snap) => {
      if (!snap.exists()) {
        setBnFromJoinRequest(null);
        return;
      }
      const row = parseJoinRequest(leadingBidUid, snap.val());
      const n = row?.bidderNumber;
      setBnFromJoinRequest(n != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
    });
    return () => unsub();
  }, [leadingBidUid, auctionIdForJoin]);

  /** Fallback: canonical 竞拍号 on user profile. */
  useEffect(() => {
    if (!leadingBidUid) {
      setBnFromUserProfile(null);
      return;
    }
    const r = ref(db, `users/${leadingBidUid}/bidderNumber`);
    const unsub = onValue(r, (snap) => {
      const v = snap.exists() ? Number(snap.val()) : NaN;
      setBnFromUserProfile(Number.isFinite(v) && v > 0 ? Math.floor(v) : null);
    });
    return () => unsub();
  }, [leadingBidUid]);

  useEffect(() => {
    if (!auctionIdForJoin) {
      setAuctionTitleForJoin("");
      return;
    }
    let cancelled = false;
    get(ref(db, `auctions/catalog/${auctionIdForJoin}`))
      .then((snap) => {
        if (cancelled) return;
        const raw = snap.val();
        if (raw && typeof raw === "object" && typeof (raw as { title?: unknown }).title === "string") {
          setAuctionTitleForJoin(String((raw as { title: string }).title));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [auctionIdForJoin]);

  useEffect(() => {
    if (!currentUser || !auctionIdForJoin) {
      setJoinRequest(null);
      setJoinReady(true);
      return;
    }
    setJoinReady(false);
    const r = ref(db, `auctionJoinRequests/${auctionIdForJoin}/${currentUser.uid}`);
    const unsub = onValue(r, (snap) => {
      if (!snap.exists()) {
        setJoinRequest(null);
      } else {
        setJoinRequest(parseJoinRequest(currentUser.uid, snap.val()));
      }
      setJoinReady(true);
    });
    return () => unsub();
  }, [currentUser, auctionIdForJoin]);

  /** Admin must approve join; only `waived` may place pre-bids here (`pay_required` → deposit link via JoinAuctionButton). */
  const canPlaceBid = useMemo(() => {
    if (!auctionIdForJoin) return true;
    if (!joinReady) return false;
    if (!joinRequest) return false;
    return joinRequest.processed === true && joinRequest.depositStatus === "waived";
  }, [auctionIdForJoin, joinReady, joinRequest]);

  useEffect(() => {
    if (!currentUser) {
      setExistingBidAmount(null);
      setBidFetchDone(false);
      return;
    }
    if (!activeLotId) {
      setExistingBidAmount(null);
      setBidFetchDone(true);
      return;
    }
    setBidFetchDone(false);
    const amountRef = ref(db, `itemBids/${activeLotId}/${currentUser.uid}/amount`);
    const unsub = onValue(amountRef, (snap) => {
      const v = snap.exists() ? Number(snap.val()) : NaN;
      setExistingBidAmount(Number.isFinite(v) && v > 0 ? v : null);
      setBidFetchDone(true);
    });
    return () => unsub();
  }, [currentUser, activeLotId]);

  useEffect(() => {
    if (!bidFetchDone || bidUiInitRef.current) return;
    bidUiInitRef.current = true;
    if (existingBidAmount != null) setEditingBid(false);
    else setEditingBid(true);
  }, [bidFetchDone, existingBidAmount]);

  /** Wheel on drum — non-passive so the page does not scroll. Pointer + touch-action handles touch. */
  useEffect(() => {
    const el = drumRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAnimateDrum(true);
      setSelectedIdx((prev) => {
        const next = prev + (e.deltaY > 0 ? 1 : -1);
        return Math.min(Math.max(next, drumMinIdx), prices.length - 1);
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [drumMinIdx, prices.length, loading, lotMismatch, lotNotFound, editingBid, canPlaceBid]);

  /** Match transform & drag step size to rendered row height (mobile uses smaller .drum-item). */
  useLayoutEffect(() => {
    if (!bidFetchDone || !canPlaceBid || !editingBid || !activeLotId) return;
    const wrap = drumRef.current;
    if (!wrap) return;

    const measure = () => {
      const first = wrap.querySelector(".drum-item") as HTMLElement | null;
      const ih = first ? first.getBoundingClientRect().height : 0;
      const wh = wrap.getBoundingClientRect().height;
      if (ih > 0 && wh > 0) {
        setDrumMetrics({ wrapH: wh, itemH: ih });
      }
    };

    measure();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    ro.observe(wrap);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [bidFetchDone, canPlaceBid, editingBid, activeLotId, drumMinIdx, lot?.startPrice]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLotNotFound(false);
      setLotMismatch(false);
      setLoading(false);
      if (!user) {
        const ret = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
        router.replace(`/register?return=${encodeURIComponent(ret)}`);
        return;
      }

      const cardSnap = await get(ref(db, `users/${user.uid}/cardBound`));
      if (cardSnap.val() !== true) {
        const ret = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
        router.replace(`/register?return=${encodeURIComponent(ret)}&uid=${user.uid}`);
        return;
      }

      setCurrentUser(user);
      const bidderSnap = await get(ref(db, `users/${user.uid}/bidderNumber`));
      setBidderNumber(bidderSnap.exists() ? Number(bidderSnap.val()) : null);

      if (resolvedLotId) {
        /** Per-lot URL: always read `auctions/lots` so `auctionId` is authoritative. */
        if (expectedAuctionId) {
          const lotSnap = await get(ref(db, `auctions/lots/${resolvedLotId}`));
          if (!lotSnap.exists()) {
            setLotNotFound(true);
            setLot(null);
            setActiveLotId(null);
            return;
          }
          const data = lotSnap.val() as Lot;
          if (data.auctionId !== expectedAuctionId) {
            setLotMismatch(true);
            setLot(null);
            setActiveLotId(null);
            return;
          }
          setLot(data);
          setActiveLotId(resolvedLotId);
        } else {
          const currentSnap = await get(ref(db, "auctions/current"));
          const currentLot = currentSnap.val() as Lot | null;
          if (currentLot && currentLot.id === resolvedLotId) {
            setLot(currentLot);
            setActiveLotId(resolvedLotId);
          } else {
            const lotSnap = await get(ref(db, `auctions/lots/${resolvedLotId}`));
            if (!lotSnap.exists()) {
              setLotNotFound(true);
              setLot(null);
              setActiveLotId(null);
              return;
            }
            const data = lotSnap.val() as Lot;
            setLot(data);
            setActiveLotId(resolvedLotId);
          }
        }
      } else {
        const currentSnap = await get(ref(db, "auctions/current"));
        const currentLot = currentSnap.val() as Lot | null;
        if (currentLot?.id) {
          setLot(currentLot);
          setActiveLotId(currentLot.id);
        } else {
          setActiveLotId(null);
        }
      }
    });
    return () => unsub();
  }, [resolvedLotId, expectedAuctionId, returnPath, router]);

  function openModifyBid() {
    setErrMsg("");
    setEditingBid(true);
    if (existingBidAmount != null && existingBidAmount > 0) {
      const i = prices.findIndex((p) => p >= existingBidAmount);
      if (i >= 0) setSelectedIdx(i);
    }
  }

  async function submitBid() {
    if (!currentUser) return;
    if (!canPlaceBid) return;
    setErrMsg("");
    setSubmitting(true);
    const amount = prices[effectiveIdx];
    const targetLotId = activeLotId || resolvedLotId || "general";

    try {
      await syncLotPrebidHighFromItemBids(db, targetLotId);

      const existingAmountSnap = await get(ref(db, `itemBids/${targetLotId}/${currentUser.uid}/amount`));
      const existingAmount = existingAmountSnap.exists() ? Number(existingAmountSnap.val()) : 0;
      if (existingAmount > 0 && amount < existingAmount) {
        throw new Error("每件拍品的预出价只能提高，不能降低");
      }

      const highRef = ref(db, `${LOT_PREBID_HIGH_PATH}/${targetLotId}`);
      const txResult = await runTransaction(highRef, (current) => {
        let safeH = 0;
        if (current != null && typeof current === "object" && "amount" in current) {
          const n = Number((current as { amount: unknown }).amount);
          if (Number.isFinite(n) && n > 0) safeH = n;
        }
        if (!Number.isFinite(amount)) return undefined;
        if (amount < existingAmount) return undefined;
        if (amount <= safeH) return undefined;
        return { amount, updatedAt: Date.now() };
      });

      if (!txResult.committed) {
        throw new Error("出价须高于当前全场最高预出价，请稍等同步后重试");
      }

      const now = Date.now();
      const bidPayload = {
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email,
        userEmail: currentUser.email,
        bidderNumber: bidderNumber || null,
        lotId: targetLotId,
        itemId: targetLotId,
        amount,
        currency: "USD",
        status: "pending",
        createdAt: now,
      };

      const historyRef = push(ref(db, `itemBidHistory/${targetLotId}`));
      await update(ref(db), {
        [`absenteeBids/${targetLotId}/${currentUser.uid}`]: bidPayload,
        [`itemBids/${targetLotId}/${currentUser.uid}`]: bidPayload,
        [`itemBidHistory/${targetLotId}/${historyRef.key}`]: { ...bidPayload, type: "proxy_max_set" },
      });

      setExistingBidAmount(amount);
      setEditingBid(false);
    } catch (e: unknown) {
      const code =
        typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code === "PERMISSION_DENIED" || code === "permission_denied") {
        setErrMsg(
          "无权限写入数据库。请在 Firebase 控制台 → Realtime Database → Rules 中为 lotPrebidHigh 添加读写规则（见项目 README「PERMISSION_DENIED」一节）。",
        );
      } else {
        const msg = e instanceof Error ? e.message : "提交失败，请重试";
        setErrMsg(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="page-wrap">加载中…</main>;

  if (lotMismatch) {
    return (
      <>
        <header className="header">
          <Link href={backHref} className="back-link">
            {backLabel}
          </Link>
          <div className="logo">
            YES <em>AUCTION</em>
          </div>
          <div className="header-spacer" aria-hidden />
        </header>
        <main className="wrap">
          <div className="error" style={{ marginTop: 24 }}>
            该拍品不属于此拍卖场次，请从拍品目录重新进入。
          </div>
          <Link className="btn-link" href={backHref} style={{ marginTop: 16, display: "inline-block" }}>
            返回拍品目录
          </Link>
        </main>
      </>
    );
  }

  if (lotNotFound) {
    return (
      <>
        <header className="header">
          <Link href={backHref} className="back-link">
            {backLabel}
          </Link>
          <div className="logo">
            YES <em>AUCTION</em>
          </div>
          <div className="header-spacer" aria-hidden />
        </header>
        <main className="wrap">
          <p className="sec-sub" style={{ marginTop: 24 }}>
            未找到该拍品，可能已被删除。
          </p>
          <Link className="btn-link" href={backHref} style={{ marginTop: 16, display: "inline-block" }}>
            返回拍品目录
          </Link>
        </main>
      </>
    );
  }

  const clamp = (v: number, mn: number, mx: number) => Math.min(Math.max(v, mn), mx);
  /** Only render prices at/above the drum floor — hides lower amounts in the drum. */
  const displayPrices = prices.slice(drumMinIdx);
  const relativeIdx = effectiveIdx - drumMinIdx;
  const ih = drumMetrics.itemH;
  const wh = drumMetrics.wrapH;
  const y = wh / 2 - ih / 2 - (relativeIdx + PAD) * ih;

  const selectedAmount = prices[effectiveIdx];
  /** Next step on the ladder (must match drum rows; same as getBidIncrement at this level). */
  const incrementToNext =
    effectiveIdx < prices.length - 1
      ? prices[effectiveIdx + 1] - selectedAmount
      : getBidIncrement(selectedAmount);

  function beginDrag(clientY: number) {
    dragRef.current.dragging = true;
    dragRef.current.startY = clientY;
    dragRef.current.lastY = clientY;
    dragRef.current.startIdx = effectiveIdx;
    dragRef.current.vel = 0;
    setAnimateDrum(false);
  }

  function moveDrag(clientY: number) {
    if (!dragRef.current.dragging) return;
    dragRef.current.vel = clientY - dragRef.current.lastY;
    dragRef.current.lastY = clientY;
    const next = clamp(
      dragRef.current.startIdx + Math.round((dragRef.current.startY - clientY) / drumMetrics.itemH),
      drumMinIdx,
      prices.length - 1,
    );
    setSelectedIdx(next);
  }

  function endDrag() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setAnimateDrum(true);
    const step = drumMetrics.itemH || 50;
    const next = clamp(
      effectiveIdx + Math.round((-dragRef.current.vel * 0.3) / step),
      drumMinIdx,
      prices.length - 1,
    );
    setSelectedIdx(next);
  }

  function onDrumPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Safari / older */
    }
    beginDrag(e.clientY);
  }

  function onDrumPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;
    e.preventDefault();
    moveDrag(e.clientY);
  }

  function onDrumPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* */
    }
    endDrag();
  }

  const est = lot ? displayEstimate(lot) : "";

  return (
    <>
      <header className="header">
        <Link href={backHref} className="back-link">
          {backLabel}
        </Link>
        <div className="logo">
          YES <em>AUCTION</em>
        </div>
        <button type="button" className="logout-btn" onClick={() => signOut(auth)}>
          登出
        </button>
      </header>

      <main className="bid-lot-page">
        <div className={`bid-lot-nav-shell${expectedAuctionId ? "" : " bid-lot-nav-shell--single"}`}>
          <aside className="bid-lot-nav-side" aria-label="相邻拍品">
            {expectedAuctionId ? (
              neighborPrev ? (
                <Link className="bid-lot-nav-btn" href={`/auction/${expectedAuctionId}/lot/${neighborPrev.id}`}>
                  <span className="bid-lot-nav-arrow" aria-hidden>
                    ‹
                  </span>
                  <span className="bid-lot-nav-text">LOT {neighborPrev.number || "—"}</span>
                </Link>
              ) : (
                <span className="bid-lot-nav-btn bid-lot-nav-btn--disabled">
                  <span className="bid-lot-nav-arrow" aria-hidden>
                    ‹
                  </span>
                  <span className="bid-lot-nav-text">—</span>
                </span>
              )
            ) : null}
          </aside>
          <div className="bid-lot-nav-center wrap">
            <div className="ubadge">
              <div className="uavatar">{(currentUser?.displayName || currentUser?.email || "?")[0]?.toUpperCase()}</div>
              <div>
                <div className="uname">{currentUser?.displayName || currentUser?.email}</div>
                <div className="uemail">{currentUser?.email}</div>
                {bidderNumber ? <div className="uemail gold">竞拍号 #{bidderNumber}</div> : null}
              </div>
            </div>

            {lot ? (
              <div className="lot-strip">
                <div className="lot-strip-tag">LOT {lot.number || "—"}</div>
                <div className="lot-strip-title">{lot.title || "—"}</div>
                {est ? <div className="lot-strip-est">估价 {est}</div> : null}
                {lot.startPrice ? (
                  <div className="lot-strip-est">起拍 {lot.startPrice}</div>
                ) : null}
              </div>
            ) : resolvedLotId ? (
              <p className="sec-sub" style={{ marginTop: 12 }}>
                正在加载拍品…
              </p>
            ) : (
              <p className="sec-sub" style={{ marginTop: 12 }}>
                当前无上拍拍品，请从拍品目录选择一件。
              </p>
            )}

            <div className="orn">✦ ✦ ✦</div>

            {auctionIdForJoin && !joinReady ? (
              <p className="sec-sub" style={{ marginBottom: 16 }}>
                正在验证参拍资格…
              </p>
            ) : null}

            {auctionIdForJoin && joinReady && !canPlaceBid ? (
              <section className="card bid-join-gate-card">
                <p className="sec-sub" style={{ marginBottom: 14 }}>
                  本场拍品需先通过管理员参拍审核。审核通过并免保证金后，您可在此设置预出价。
                </p>
                <JoinAuctionButton
                  auctionId={auctionIdForJoin}
                  auctionTitle={auctionTitleForJoin || lot?.title || "拍卖专场"}
                  user={currentUser}
                  authLoading={false}
                />
              </section>
            ) : null}

            {!bidFetchDone && activeLotId && canPlaceBid ? (
              <p className="sec-sub" style={{ marginBottom: 16 }}>
                正在同步您的预出价信息…
              </p>
            ) : null}

            {bidFetchDone && canPlaceBid && activeLotId ? (
              <section className="bid-leading-card" aria-live="polite">
                <div className="bid-leading-label">当前全场最高预出价</div>
                {fieldHighEffective > 0 ? (
                  <>
                    <div className="bid-leading-amount">{fmt(fieldHighEffective)}</div>
                    <div className="bid-leading-bn">
                      {displayLeadingBidderNumber != null ? (
                        <>
                          领先竞买人 · 竞拍号 <strong>#{displayLeadingBidderNumber}</strong>
                        </>
                      ) : (
                        <>领先竞买人 · 竞拍号尚未登记</>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bid-leading-empty">尚无任何预出价</div>
                )}
              </section>
            ) : null}

            {bidFetchDone && canPlaceBid && activeLotId && existingBidAmount != null && !editingBid ? (
              <section className="card bid-current-card">
                <p className="bid-current-line">
                  您当前的预出价为 <strong className="bid-current-amt">{fmt(existingBidAmount)}</strong>
                </p>
                <p className="sec-sub" style={{ marginBottom: 14 }}>
                  如需提高上限，请点击修改（不可降低）。
                </p>
                <button type="button" className="btn-outline bid-modify-btn" onClick={openModifyBid}>
                  修改预出价
                </button>
              </section>
            ) : null}

            {bidFetchDone && canPlaceBid && activeLotId && editingBid ? (
              <>
                <div className="sec-sub" style={{ marginBottom: 8 }}>
                  {existingBidAmount != null ? "调整您的预出价上限" : "设定您的预出价上限"}
                </div>
                <p className="sec-sub" style={{ marginBottom: 10 }}>
                  {fieldHighEffective > 0
                    ? "提高出价须高于上方卡片中的金额（含您本人当前出价；实时更新）。"
                    : "尚无竞买人预出价时，只需满足起拍价与下方加价档。"}
                </p>
                <button type="button" className="btn-link" style={{ marginTop: 0, marginBottom: 8 }} onClick={() => setHowOpen(true)}>
                  如何进行预出价 →
                </button>

                <section className="card">
                  <div
                    ref={drumRef}
                    className="drum-wrap"
                    onPointerDown={onDrumPointerDown}
                    onPointerMove={onDrumPointerMove}
                    onPointerUp={onDrumPointerUp}
                    onPointerCancel={onDrumPointerUp}
                  >
                    <div className="drum-sel" />
                    <div
                      className="drum-inner"
                      style={{
                        transform: `translateY(${y}px)`,
                        transition: animateDrum ? "transform 0.2s cubic-bezier(0.25,0.1,0.25,1)" : "none",
                      }}
                    >
                      {Array.from({ length: PAD }).map((_, i) => (
                        <div key={`pad-top-${i}`} className="drum-item" />
                      ))}
                      {displayPrices.map((p, idx) => (
                        <div
                          key={p}
                          className={`drum-item ${idx === relativeIdx ? "sel" : ""} ${Math.abs(idx - relativeIdx) === 1 ? "near" : ""}`}
                        >
                          {fmt(p)}
                        </div>
                      ))}
                      {Array.from({ length: PAD }).map((_, i) => (
                        <div key={`pad-bot-${i}`} className="drum-item" />
                      ))}
                    </div>
                  </div>

                  <div className="summary">
                    <div>您的预出价上限: {fmt(selectedAmount)}</div>
                    <div>每口加价: +{fmt(incrementToNext)}</div>
                  </div>

                  <div className="sec-sub" style={{ marginBottom: 12 }}>
                    此为预出价，拍卖开始前不会扣款。系统将自动为您出价，直至您的预出价上限。
                  </div>
                  {errMsg ? <div className="error">{errMsg}</div> : null}
                  <div className="bid-edit-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={submitting || (resolvedLotId ? !activeLotId || !lot : !activeLotId)}
                      onClick={submitBid}
                    >
                      {submitting ? "提交中…" : existingBidAmount != null ? "确认修改" : "提交预出价"}
                    </button>
                    {existingBidAmount != null ? (
                      <button type="button" className="btn-link bid-cancel-edit" onClick={() => setEditingBid(false)}>
                        取消
                      </button>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}
          </div>
          <aside className="bid-lot-nav-side" aria-label="相邻拍品">
            {expectedAuctionId ? (
              neighborNext ? (
                <Link className="bid-lot-nav-btn bid-lot-nav-btn--next" href={`/auction/${expectedAuctionId}/lot/${neighborNext.id}`}>
                  <span className="bid-lot-nav-text">LOT {neighborNext.number || "—"}</span>
                  <span className="bid-lot-nav-arrow" aria-hidden>
                    ›
                  </span>
                </Link>
              ) : (
                <span className="bid-lot-nav-btn bid-lot-nav-btn--disabled bid-lot-nav-btn--next">
                  <span className="bid-lot-nav-text">—</span>
                  <span className="bid-lot-nav-arrow" aria-hidden>
                    ›
                  </span>
                </span>
              )
            ) : null}
          </aside>
        </div>
      </main>

      <div className={`overlay ${howOpen ? "open" : ""}`} onClick={() => setHowOpen(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="modal-close" onClick={() => setHowOpen(false)}>
            ✕
          </button>
          <div className="modal-title">如何进行预出价？</div>
          <div className="modal-body">
            <strong>什么是预出价？</strong>
            <br />
            您只需设定愿意支付的最高金额（预出价上限），系统会在拍卖中自动以最低必要价格出价。
            <br />
            <br />
            <strong>举例说明</strong>
            <br />
            若您设定预出价上限 $5,000，当前竞价为 $2,000，系统代您出价 $2,250。
            <br />
            <br />
            <strong>何时扣款？</strong>
            <br />
            提交预出价时不会扣款，仅在您成功赢得拍品后才会收费。
          </div>
        </div>
      </div>
    </>
  );
}

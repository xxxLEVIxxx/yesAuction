"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, onValue, push, ref, update } from "firebase/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { JoinAuctionButton } from "@/components/JoinAuctionButton";
import { parseJoinRequest, type JoinRequestRow } from "@/lib/auctionJoinRequests";
import { buildEstimate } from "@/lib/importLotsFromSpreadsheet";
import { minPriceIndexFromStart } from "@/lib/lotBid";

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

function getInc(p: number) {
  if (p < 200) return 10;
  if (p < 500) return 25;
  if (p < 1000) return 50;
  if (p < 2000) return 100;
  if (p < 5000) return 250;
  if (p < 10000) return 500;
  if (p < 20000) return 1000;
  if (p < 50000) return 2500;
  if (p < 100000) return 5000;
  if (p < 500000) return 10000;
  if (p < 1000000) return 20000;
  return 50000;
}

export function fmt(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
  return `$${Number(n).toLocaleString("en-US")}`;
}

function buildPrices() {
  const out: number[] = [];
  let p = 10;
  while (p <= 5000000) {
    out.push(p);
    p += getInc(p);
  }
  return out;
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
  const prices = useMemo(buildPrices, []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const drumRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [bidderNumber, setBidderNumber] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");
  /** Current pre-bid max from RTDB `itemBids/{lotId}/{uid}/amount` */
  const [existingBidAmount, setExistingBidAmount] = useState<number | null>(null);
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
  const ITEM_H = 50;
  const PAD = 3;

  const minSelectableIdx = useMemo(
    () => minPriceIndexFromStart(prices, lot?.startPrice, initialMinBid),
    [prices, lot, initialMinBid],
  );

  /** Drum floor: start price, or current bid when modifying (pre-bids can only go up). */
  const drumMinIdx = useMemo(() => {
    let m = minSelectableIdx;
    if (editingBid && existingBidAmount != null && existingBidAmount > 0) {
      const i = prices.findIndex((p) => p >= existingBidAmount);
      if (i >= 0) m = Math.max(m, i);
    }
    return m;
  }, [minSelectableIdx, prices, editingBid, existingBidAmount]);

  useEffect(() => {
    setSelectedIdx((prev) => Math.max(drumMinIdx, prev));
  }, [drumMinIdx]);

  useEffect(() => {
    bidUiInitRef.current = false;
  }, [activeLotId]);

  const auctionIdForJoin = useMemo(
    () => (lot?.auctionId || expectedAuctionId || "").trim(),
    [lot?.auctionId, expectedAuctionId],
  );

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

  /** Wheel / touch: must be non-passive so the page behind does not scroll. Re-run when drum mounts (e.g. after loading). */
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

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [drumMinIdx, prices.length, loading, lotMismatch, lotNotFound, editingBid, canPlaceBid]);

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
    const amount = prices[selectedIdx];
    const targetLotId = activeLotId || resolvedLotId || "general";

    try {
      const existingAmountSnap = await get(ref(db, `itemBids/${targetLotId}/${currentUser.uid}/amount`));
      const existingAmount = existingAmountSnap.exists() ? Number(existingAmountSnap.val()) : 0;
      if (existingAmount > 0 && amount < existingAmount) {
        throw new Error("每件拍品的预出价只能提高，不能降低");
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "提交失败，请重试";
      setErrMsg(msg);
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
  const relativeIdx = selectedIdx - drumMinIdx;
  const y = 272 / 2 - ITEM_H / 2 - (relativeIdx + PAD) * ITEM_H;

  function beginDrag(clientY: number) {
    dragRef.current.dragging = true;
    dragRef.current.startY = clientY;
    dragRef.current.lastY = clientY;
    dragRef.current.startIdx = selectedIdx;
    dragRef.current.vel = 0;
    setAnimateDrum(false);
  }

  function moveDrag(clientY: number) {
    if (!dragRef.current.dragging) return;
    dragRef.current.vel = clientY - dragRef.current.lastY;
    dragRef.current.lastY = clientY;
    const next = clamp(
      dragRef.current.startIdx + Math.round((dragRef.current.startY - clientY) / ITEM_H),
      drumMinIdx,
      prices.length - 1,
    );
    setSelectedIdx(next);
  }

  function endDrag() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setAnimateDrum(true);
    const next = clamp(
      selectedIdx + Math.round(-dragRef.current.vel * 0.3),
      drumMinIdx,
      prices.length - 1,
    );
    setSelectedIdx(next);
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

      <main className="wrap bid-lot-page">
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
                <button type="button" className="btn-link" style={{ marginTop: 0, marginBottom: 8 }} onClick={() => setHowOpen(true)}>
                  如何进行预出价 →
                </button>

                <section className="card">
                  <div
                    ref={drumRef}
                    className="drum-wrap"
                    onMouseDown={(e) => beginDrag(e.clientY)}
                    onMouseMove={(e) => moveDrag(e.clientY)}
                    onMouseUp={endDrag}
                    onMouseLeave={endDrag}
                    onTouchStart={(e) => beginDrag(e.touches[0].clientY)}
                    onTouchMove={(e) => {
                      e.preventDefault();
                      moveDrag(e.touches[0].clientY);
                    }}
                    onTouchEnd={endDrag}
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
                    <div>您的预出价上限: {fmt(prices[selectedIdx])}</div>
                    <div>每口加价: +{fmt(getInc(prices[selectedIdx]))}</div>
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

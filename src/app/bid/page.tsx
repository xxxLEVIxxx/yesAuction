"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, push, ref, update } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Lot = {
  id?: string;
  number?: string;
  title?: string;
  estimate?: string;
};

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

function fmt(n: number) {
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

export default function BidPage() {
  const router = useRouter();
  const [lotId, setLotId] = useState<string | null>(null);
  const [minBid, setMinBid] = useState(100);
  const prices = useMemo(buildPrices, []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [bidderNumber, setBidderNumber] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [activeLotId, setActiveLotId] = useState<string | null>(lotId);
  const [lot, setLot] = useState<Lot | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [animateDrum, setAnimateDrum] = useState(false);
  const dragRef = useRef({
    dragging: false,
    startY: 0,
    startIdx: 0,
    lastY: 0,
    vel: 0,
  });
  const ITEM_H = 50;
  const PAD = 3;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setLotId(p.get("lotId"));
    setMinBid(Number(p.get("minBid") || "100"));
  }, []);

  useEffect(() => {
    const i = prices.findIndex((p) => p >= minBid);
    setSelectedIdx(i >= 0 ? i : 0);
  }, [minBid, prices]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setLoading(false);
      if (!user) {
        router.replace(`/register?return=${encodeURIComponent(`/bid${window.location.search}`)}`);
        return;
      }

      const cardSnap = await get(ref(db, `users/${user.uid}/cardBound`));
      if (cardSnap.val() !== true) {
        router.replace(`/register?return=${encodeURIComponent(`/bid${window.location.search}`)}&uid=${user.uid}`);
        return;
      }

      setCurrentUser(user);
      const bidderSnap = await get(ref(db, `users/${user.uid}/bidderNumber`));
      setBidderNumber(bidderSnap.exists() ? Number(bidderSnap.val()) : null);

      // Resolve active lot
      if (lotId) {
        const currentSnap = await get(ref(db, "auctions/current"));
        const currentLot = currentSnap.val();
        if (currentLot && currentLot.id === lotId) {
          setLot(currentLot);
          setActiveLotId(lotId);
        } else {
          const lotSnap = await get(ref(db, `auctions/lots/${lotId}`));
          if (lotSnap.exists()) setLot(lotSnap.val());
          setActiveLotId(lotId);
        }
      } else {
        const currentSnap = await get(ref(db, "auctions/current"));
        const currentLot = currentSnap.val();
        if (currentLot?.id) {
          setLot(currentLot);
          setActiveLotId(currentLot.id);
        } else {
          setActiveLotId(null);
        }
      }
    });
    return () => unsub();
  }, [lotId, router]);

  async function submitBid() {
    if (!currentUser) return;
    setErrMsg("");
    setSubmitting(true);
    const amount = prices[selectedIdx];
    const targetLotId = activeLotId || lotId || "general";

    try {
      const existingAmountSnap = await get(ref(db, `itemBids/${targetLotId}/${currentUser.uid}/amount`));
      const existingAmount = existingAmountSnap.exists() ? Number(existingAmountSnap.val()) : 0;
      if (existingAmount > 0 && amount < existingAmount) {
        throw new Error("每件拍品的代理出价只能提高，不能降低");
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

      setSuccess(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "提交失败，请重试";
      setErrMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="page-wrap">加载中…</main>;

  const clamp = (v: number, mn: number, mx: number) => Math.min(Math.max(v, mn), mx);
  const y = 272 / 2 - ITEM_H / 2 - (selectedIdx + PAD) * ITEM_H;

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
      0,
      prices.length - 1,
    );
    setSelectedIdx(next);
  }

  function endDrag() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setAnimateDrum(true);
    const next = clamp(selectedIdx + Math.round(-dragRef.current.vel * 0.3), 0, prices.length - 1);
    setSelectedIdx(next);
  }

  return (
    <>
      <header className="header">
        <a href="https://theyesauction.com" className="back-link">
          ← YES AUCTION
        </a>
        <div className="logo">
          YES <em>AUCTION</em>
        </div>
        <button className="logout-btn" onClick={() => signOut(auth)}>
          登出
        </button>
      </header>

      <main className="wrap">
        {!success ? (
          <>
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
                <div className="lot-strip-est">{lot.estimate ? `估价 ${lot.estimate}` : ""}</div>
              </div>
            ) : null}

            <div className="orn">✦ ✦ ✦</div>
            <div className="sec-sub" style={{ marginBottom: 8 }}>
              设定您的最高出价
            </div>
            <button type="button" className="btn-link" style={{ marginTop: 0, marginBottom: 8 }} onClick={() => setHowOpen(true)}>
              如何进行代理竞价 →
            </button>

            <section className="card">
              <div
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
                onWheel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAnimateDrum(true);
                  setSelectedIdx((prev) => clamp(prev + (e.deltaY > 0 ? 1 : -1), 0, prices.length - 1));
                }}
              >
                <div className="drum-sel" />
                <div className="drum-inner" style={{ transform: `translateY(${y}px)`, transition: animateDrum ? "transform 0.2s cubic-bezier(0.25,0.1,0.25,1)" : "none" }}>
                  {Array.from({ length: PAD }).map((_, i) => (
                    <div key={`pad-top-${i}`} className="drum-item" />
                  ))}
                  {prices.map((p, idx) => (
                    <div
                      key={p}
                      className={`drum-item ${idx === selectedIdx ? "sel" : ""} ${Math.abs(idx - selectedIdx) === 1 ? "near" : ""}`}
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
                <div>您的最高出价: {fmt(prices[selectedIdx])}</div>
                <div>每口加价: +{fmt(getInc(prices[selectedIdx]))}</div>
              </div>

              <div className="sec-sub" style={{ marginBottom: 12 }}>
                此为代理出价，拍卖开始前不会扣款。系统将自动为您出价，直至您的最高限额。
              </div>
              {errMsg ? <div className="error">{errMsg}</div> : null}
              <button className="btn" disabled={submitting} onClick={submitBid}>
                {submitting ? "提交中…" : "提交代理出价"}
              </button>
            </section>
          </>
        ) : (
          <section className="card" style={{ textAlign: "center", marginTop: 40 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎯</div>
            <div className="sec-title" style={{ marginTop: 0 }}>
              代理出价已提交
            </div>
            <p className="sec-sub">您的最高出价已成功登记：{fmt(prices[selectedIdx])}</p>
            <Link className="btn-link" href="/">
              返回拍卖首页
            </Link>
          </section>
        )}
      </main>

      <div className={`overlay ${howOpen ? "open" : ""}`} onClick={() => setHowOpen(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setHowOpen(false)}>
            ✕
          </button>
          <div className="modal-title">如何进行代理竞价？</div>
          <div className="modal-body">
            <strong>什么是代理出价？</strong>
            <br />
            您只需设定愿意支付的最高金额，系统会在拍卖中自动以最低必要价格出价。
            <br />
            <br />
            <strong>举例说明</strong>
            <br />
            若您设定最高出价 $5,000，当前竞价为 $2,000，系统代您出价 $2,250。
            <br />
            <br />
            <strong>何时扣款？</strong>
            <br />
            提交代理出价时不会扣款，仅在您成功赢得拍品后才会收费。
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { get, onValue, ref, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { parseJoinRequest, type JoinRequestRow } from "@/lib/auctionJoinRequests";

const DEPOSIT_PAY_URL =
  process.env.NEXT_PUBLIC_SECURITY_DEPOSIT_URL?.trim() || "https://theyesauction.com";

type Props = {
  auctionId: string;
  auctionTitle: string;
  user: User | null;
  authLoading: boolean;
};

export function JoinAuctionButton({ auctionId, auctionTitle, user, authLoading }: Props) {
  const [request, setRequest] = useState<JoinRequestRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) {
      setRequest(null);
      return;
    }
    const r = ref(db, `auctionJoinRequests/${auctionId}/${user.uid}`);
    const unsub = onValue(r, (snap) => {
      if (!snap.exists()) {
        setRequest(null);
        return;
      }
      const row = parseJoinRequest(user.uid, snap.val());
      setRequest(row);
    });
    return () => unsub();
  }, [user, auctionId]);

  const depositHref = useMemo(() => {
    try {
      const u = new URL(DEPOSIT_PAY_URL, typeof window !== "undefined" ? window.location.origin : "https://theyesauction.com");
      u.searchParams.set("auctionId", auctionId);
      return u.toString();
    } catch {
      return DEPOSIT_PAY_URL;
    }
  }, [auctionId]);

  async function onJoin() {
    if (!user) return;
    setErr("");
    setSubmitting(true);
    try {
      const bidderSnap = await get(ref(db, `users/${user.uid}/bidderNumber`));
      const bidderNumber = bidderSnap.exists() ? Number(bidderSnap.val()) : null;
      const now = Date.now();
      await set(ref(db, `auctionJoinRequests/${auctionId}/${user.uid}`), {
        userId: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        bidderNumber,
        auctionId,
        auctionTitle,
        createdAt: now,
        updatedAt: now,
        processed: false,
        processedAt: null,
        depositStatus: "pending",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("PERMISSION_DENIED")) {
        setErr("数据库权限不足：请在 Firebase Realtime Database Rules 中开放 auctionJoinRequests 写入。");
      } else {
        setErr(msg || "提交失败");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return <span className="auction-join-placeholder" />;
  }

  if (!user) {
    return (
      <div className="auction-join-row">
        <Link href={`/register?return=${encodeURIComponent("/")}`} className="btn auction-join-btn">
          登录后申请参拍
        </Link>
      </div>
    );
  }

  if (request) {
    if (request.processed && request.depositStatus === "pay_required") {
      return (
        <div className="auction-join-row auction-join-row--stack">
          <p className="auction-join-hint">审核结果：需缴纳本场保证金</p>
          <a
            href={depositHref}
            className="btn auction-join-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            缴纳保证金
          </a>
        </div>
      );
    }
    if (request.processed && request.depositStatus === "waived") {
      return (
        <div className="auction-join-row auction-join-row--stack">
          <p className="auction-join-hint">审核结果：免保证金，可参与预出价</p>
          <Link href={`/auction/${auctionId}`} className="btn auction-join-btn">
            浏览拍品 / 预出价
          </Link>
        </div>
      );
    }
    if (!request.processed) {
      return (
        <div className="auction-join-row">
          <span className="auction-join-done">已提交参拍申请，等待审核</span>
        </div>
      );
    }
    return (
      <div className="auction-join-row">
        <span className="auction-join-done">已处理</span>
      </div>
    );
  }

  return (
    <div className="auction-join-row">
      <button type="button" className="btn auction-join-btn" onClick={onJoin} disabled={submitting}>
        {submitting ? "提交中…" : "申请参拍"}
      </button>
      {err ? <span className="auction-join-err">{err}</span> : null}
    </div>
  );
}

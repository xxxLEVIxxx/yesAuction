"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { get, ref, update } from "firebase/database";
import { db } from "@/lib/firebase";
import type { DepositStatus } from "@/lib/auctionJoinRequests";
import { parseJoinRequestsForAuction, type JoinRequestRow } from "@/lib/auctionJoinRequests";

type Tab = "unprocessed" | "processed";

export function AttendanceDetailClient() {
  const params = useParams();
  const auctionId = params.auctionId as string;

  const [auctionTitle, setAuctionTitle] = useState("");
  const [rows, setRows] = useState<JoinRequestRow[]>([]);
  const [tab, setTab] = useState<Tab>("unprocessed");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingUid, setSavingUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    const [catSnap, jrSnap] = await Promise.all([
      get(ref(db, `auctions/catalog/${auctionId}`)),
      get(ref(db, `auctionJoinRequests/${auctionId}`)),
    ]);
    const cat = catSnap.val() as { title?: string } | null;
    setAuctionTitle(cat?.title ? String(cat.title) : auctionId);
    setRows(parseJoinRequestsForAuction(jrSnap.val()));
  }, [auctionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "读取失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const unprocessed = rows.filter((r) => !r.processed);
  const processed = rows.filter((r) => r.processed);

  async function applyDecision(uid: string, depositStatus: Exclude<DepositStatus, "pending">) {
    setSavingUid(uid);
    setErr("");
    try {
      await update(ref(db, `auctionJoinRequests/${auctionId}/${uid}`), {
        depositStatus,
        processed: true,
        processedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingUid(null);
    }
  }

  async function revertToPending(uid: string) {
    if (!confirm("将该申请退回待处理？")) return;
    setSavingUid(uid);
    setErr("");
    try {
      await update(ref(db, `auctionJoinRequests/${auctionId}/${uid}`), {
        depositStatus: "pending",
        processed: false,
        processedAt: null,
        updatedAt: Date.now(),
      });
      await load();
      setTab("unprocessed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingUid(null);
    }
  }

  async function changeProcessedDeposit(uid: string, depositStatus: Exclude<DepositStatus, "pending">) {
    setSavingUid(uid);
    setErr("");
    try {
      await update(ref(db, `auctionJoinRequests/${auctionId}/${uid}`), {
        depositStatus,
        updatedAt: Date.now(),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingUid(null);
    }
  }

  function depositLabel(s: DepositStatus) {
    if (s === "waived") return "免保证金";
    if (s === "pay_required") return "需缴纳保证金";
    return "待审核";
  }

  if (loading) {
    return <div className="admin-muted">加载中…</div>;
  }

  const shown = tab === "unprocessed" ? unprocessed : processed;

  return (
    <>
      <p className="admin-page-desc" style={{ marginTop: 0 }}>
        <Link href="/admin/attendance" className="admin-auction-linkbtn" style={{ textDecoration: "none" }}>
          ← 返回场次列表
        </Link>
      </p>
      <h1 className="admin-page-title">{auctionTitle}</h1>
      <p className="admin-page-desc">
        场次 ID：<code className="admin-cell-mono">{auctionId}</code> — 未处理 {unprocessed.length} 人 · 已处理 {processed.length} 人
      </p>
      {err ? <div className="error admin-auction-alert">{err}</div> : null}

      <div className="admin-attendance-tabs">
        <button
          type="button"
          className={`admin-attendance-tab ${tab === "unprocessed" ? "active" : ""}`}
          onClick={() => setTab("unprocessed")}
        >
          待处理 ({unprocessed.length})
        </button>
        <button
          type="button"
          className={`admin-attendance-tab ${tab === "processed" ? "active" : ""}`}
          onClick={() => setTab("processed")}
        >
          已处理 ({processed.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <section className="admin-card-block" style={{ marginTop: 16 }}>
          <p className="admin-muted">{tab === "unprocessed" ? "暂无待处理申请。" : "暂无已处理记录。"}</p>
        </section>
      ) : (
        <div className="admin-table-wrap" style={{ marginTop: 16 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>竞拍号</th>
                <th>姓名 / 邮箱</th>
                <th>申请时间</th>
                <th>保证金</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.bidderNumber != null ? `#${r.bidderNumber}` : "—"}</td>
                  <td>
                    <div>{r.displayName || "—"}</div>
                    <div className="admin-cell-mono">{r.email || "—"}</div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN") : "—"}
                  </td>
                  <td>{depositLabel(r.depositStatus)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {tab === "unprocessed" ? (
                      <>
                        <button
                          type="button"
                          className="admin-attendance-action waived"
                          disabled={savingUid === r.id}
                          onClick={() => applyDecision(r.id, "waived")}
                        >
                          免保证金
                        </button>
                        <button
                          type="button"
                          className="admin-attendance-action pay"
                          disabled={savingUid === r.id}
                          onClick={() => applyDecision(r.id, "pay_required")}
                        >
                          需缴纳
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="admin-attendance-action waived"
                          disabled={savingUid === r.id}
                          onClick={() => changeProcessedDeposit(r.id, "waived")}
                        >
                          改为免保证金
                        </button>
                        <button
                          type="button"
                          className="admin-attendance-action pay"
                          disabled={savingUid === r.id}
                          onClick={() => changeProcessedDeposit(r.id, "pay_required")}
                        >
                          改为需缴纳
                        </button>
                        <button
                          type="button"
                          className="admin-attendance-action muted"
                          disabled={savingUid === r.id}
                          onClick={() => revertToPending(r.id)}
                        >
                          退回待处理
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

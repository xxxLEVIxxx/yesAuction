"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "@/lib/firebase";
import { countPendingPerAuction } from "@/lib/auctionJoinRequests";
import { parseCatalogRows, type AuctionCatalogRow } from "@/lib/auctionCatalog";

export function AttendanceAuctionsClient() {
  const [rows, setRows] = useState<{ auction: AuctionCatalogRow; pending: number; total: number }[]>([]);
  const [processedOnly, setProcessedOnly] = useState<{ auction: AuctionCatalogRow; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const [catSnap, jrSnap] = await Promise.all([
      get(ref(db, "auctions/catalog")),
      get(ref(db, "auctionJoinRequests")),
    ]);
    const catalog = parseCatalogRows(catSnap.val()).filter((a) => a.status !== "draft");
    const counts = countPendingPerAuction(jrSnap.val());
    const list: { auction: AuctionCatalogRow; pending: number; total: number }[] = [];
    const done: { auction: AuctionCatalogRow; total: number }[] = [];
    for (const a of catalog) {
      const c = counts[a.id];
      if (!c) continue;
      if (c.pending > 0) {
        list.push({ auction: a, pending: c.pending, total: c.total });
      } else if (c.total > 0) {
        done.push({ auction: a, total: c.total });
      }
    }
    list.sort((x, y) => y.pending - x.pending || x.auction.startAt - y.auction.startAt);
    done.sort((x, y) => y.total - x.total);
    setRows(list);
    setProcessedOnly(done);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "读取失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) {
    return <div className="admin-muted">加载中…</div>;
  }

  return (
    <>
      <h1 className="admin-page-title">参拍审核</h1>
      <p className="admin-page-desc">
        以下为「仍有未处理申请」的场次。点入场次可审核保证金：免保证金 / 需缴纳。数据路径：<code>auctionJoinRequests</code>
      </p>
      {err ? <div className="error admin-auction-alert">{err}</div> : null}

      {rows.length === 0 ? (
        <section className="admin-card-block">
          <p className="admin-muted">当前没有待处理参拍申请的场次（或尚未有人申请）。</p>
        </section>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>场次</th>
                <th>待处理</th>
                <th>申请总数</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ auction, pending, total }) => (
                <tr key={auction.id}>
                  <td>
                    <strong>{auction.title}</strong>
                  </td>
                  <td>
                    <span className="admin-attendance-pending">{pending}</span>
                  </td>
                  <td>{total}</td>
                  <td>
                    <Link href={`/admin/attendance/${auction.id}`} className="admin-auction-linkbtn" style={{ textDecoration: "none" }}>
                      进入审核 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {processedOnly.length > 0 ? (
        <>
          <h2 className="admin-card-block-title" style={{ marginTop: 32 }}>
            已全部处理（可查看记录）
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>场次</th>
                  <th>申请数</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {processedOnly.map(({ auction, total }) => (
                  <tr key={auction.id}>
                    <td>
                      <strong>{auction.title}</strong>
                    </td>
                    <td>{total}</td>
                    <td>
                      <Link href={`/admin/attendance/${auction.id}`} className="admin-auction-linkbtn" style={{ textDecoration: "none" }}>
                        查看 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

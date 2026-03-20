"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { get, push, ref, remove, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/auctionCatalog";
import type { AuctionRoundEntry, AuctionRoundRow } from "@/lib/auctionRounds";
import { formatRoundTimeRange, parseRoundRows } from "@/lib/auctionRounds";

const emptyRoundForm = () => ({
  label: "",
  description: "",
  startAt: toDateTimeLocalValue(Date.now() + 3600000),
  endAt: "",
  order: "0",
});

export function AuctionRoundsAdminClient() {
  const params = useParams();
  const auctionId = params.auctionId as string;

  const [auctionTitle, setAuctionTitle] = useState<string>("");
  const [rounds, setRounds] = useState<AuctionRoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyRoundForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const basePath = `auctions/rounds/${auctionId}`;

  const load = useCallback(async () => {
    setErr("");
    const [catSnap, roundsSnap] = await Promise.all([
      get(ref(db, `auctions/catalog/${auctionId}`)),
      get(ref(db, basePath)),
    ]);
    const cat = catSnap.val() as Record<string, unknown> | null;
    if (cat && typeof cat === "object" && String(cat.title ?? "")) {
      setAuctionTitle(String(cat.title));
    } else {
      setAuctionTitle("");
    }
    setRounds(parseRoundRows(roundsSnap.val()));
  }, [auctionId, basePath]);

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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      setErr("请填写轮次名称");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const now = Date.now();
      const newRef = push(ref(db, basePath));
      const payload: AuctionRoundEntry = {
        label: form.label.trim(),
        description: form.description.trim(),
        startAt: fromDateTimeLocalValue(form.startAt),
        endAt: form.endAt.trim() ? fromDateTimeLocalValue(form.endAt) : null,
        order: Number(form.order) || 0,
        createdAt: now,
        updatedAt: now,
      };
      await set(newRef, payload);
      setForm(emptyRoundForm());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r: AuctionRoundRow) {
    setEditingId(r.id);
    setForm({
      label: r.label,
      description: r.description,
      startAt: toDateTimeLocalValue(r.startAt),
      endAt: r.endAt ? toDateTimeLocalValue(r.endAt) : "",
      order: String(r.order),
    });
  }

  async function onUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editingId || !form.label.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const now = Date.now();
      const prev = rounds.find((x) => x.id === editingId);
      const payload: AuctionRoundEntry = {
        label: form.label.trim(),
        description: form.description.trim(),
        startAt: fromDateTimeLocalValue(form.startAt),
        endAt: form.endAt.trim() ? fromDateTimeLocalValue(form.endAt) : null,
        order: Number(form.order) || 0,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      await set(ref(db, `${basePath}/${editingId}`), payload);
      setEditingId(null);
      setForm(emptyRoundForm());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyRoundForm());
  }

  async function onDelete(id: string) {
    if (!confirm("确定删除该轮次？已关联拍品请先在「拍品与场次」中调整。")) return;
    setErr("");
    try {
      await remove(ref(db, `${basePath}/${id}`));
      if (editingId === id) cancelEdit();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    }
  }

  if (loading) {
    return <div className="admin-muted">加载中…</div>;
  }

  return (
    <>
      <p className="admin-page-desc" style={{ marginTop: 0 }}>
        <Link href="/admin/auctions" className="admin-auction-linkbtn" style={{ textDecoration: "none" }}>
          ← 返回拍卖场次
        </Link>
      </p>
      <h1 className="admin-page-title">轮次管理</h1>
      <p className="admin-page-desc">
        场次：<strong>{auctionTitle || auctionId}</strong>
        <br />
        数据路径：<code>{basePath}</code> — 每一天/每一轮可设置独立时间段与说明；拍品在「拍品与场次」中关联到具体轮次。
      </p>

      {err ? <div className="error admin-auction-alert">{err}</div> : null}

      <section className="admin-card-block admin-auction-form-card">
        <h2 className="admin-card-block-title">{editingId ? "编辑轮次" : "新建轮次"}</h2>
        <form className="admin-auction-form" onSubmit={editingId ? onUpdate : onCreate}>
          <label className="admin-auction-label">
            轮次名称 <span className="admin-auction-req">*</span>
            <input
              className="admin-auction-input"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder='例如：Day 1、第 1 天、上午场'
              required
            />
          </label>
          <label className="admin-auction-label">
            本轮说明
            <textarea
              className="admin-auction-textarea"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="本轮上拍范围、注意事项等"
              rows={3}
            />
          </label>
          <div className="admin-auction-row2">
            <label className="admin-auction-label">
              开始时间 <span className="admin-auction-req">*</span>
              <input
                className="admin-auction-input"
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                required
              />
            </label>
            <label className="admin-auction-label">
              结束时间（可选）
              <input
                className="admin-auction-input"
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              />
            </label>
          </div>
          <label className="admin-auction-label">
            排序（数字越小越靠前）
            <input
              className="admin-auction-input"
              type="number"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
            />
          </label>
          <div className="admin-auction-actions">
            {editingId ? (
              <>
                <button type="button" className="admin-auction-btn secondary" onClick={cancelEdit} disabled={saving}>
                  取消
                </button>
                <button type="submit" className="admin-auction-btn primary" disabled={saving}>
                  {saving ? "保存中…" : "保存修改"}
                </button>
              </>
            ) : (
              <button type="submit" className="admin-auction-btn primary" disabled={saving}>
                {saving ? "添加中…" : "添加轮次"}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-card-block" style={{ marginTop: 24 }}>
        <h2 className="admin-card-block-title">已建轮次</h2>
        {rounds.length === 0 ? (
          <p className="admin-muted">暂无轮次，可在上方添加 Day 1、Day 2 等。</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>排序</th>
                  <th>名称</th>
                  <th>时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.id}>
                    <td>{r.order}</td>
                    <td>
                      <strong>{r.label}</strong>
                      {r.description ? <div className="admin-auction-cell-sub">{r.description}</div> : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatRoundTimeRange(r)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="admin-auction-linkbtn" onClick={() => startEdit(r)}>
                        编辑
                      </button>
                      <button type="button" className="admin-auction-linkbtn danger" onClick={() => onDelete(r.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

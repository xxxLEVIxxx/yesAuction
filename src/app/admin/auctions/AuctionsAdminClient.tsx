"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { get, push, ref, remove, set } from "firebase/database";
import { db } from "@/lib/firebase";
import type { AuctionCatalogEntry, AuctionCatalogRow } from "@/lib/auctionCatalog";
import {
  formatAuctionDate,
  fromDateTimeLocalValue,
  parseCatalogRows,
  toDateTimeLocalValue,
} from "@/lib/auctionCatalog";

const emptyForm = () => ({
  title: "",
  summary: "",
  description: "",
  startAt: toDateTimeLocalValue(Date.now() + 86400000),
  endAt: "",
  status: "scheduled" as AuctionCatalogEntry["status"],
});

export function AuctionsAdminClient() {
  const [rows, setRows] = useState<AuctionCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    const snap = await get(ref(db, "auctions/catalog"));
    const list = parseCatalogRows(snap.val());
    list.sort((a, b) => b.startAt - a.startAt);
    setRows(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "无法读取拍卖数据，请检查 Firebase 规则（需允许写入 auctions/catalog）。");
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
    if (!form.title.trim()) {
      setErr("请填写标题");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const now = Date.now();
      const newRef = push(ref(db, "auctions/catalog"));
      const payload: AuctionCatalogEntry = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        startAt: fromDateTimeLocalValue(form.startAt),
        endAt: form.endAt.trim() ? fromDateTimeLocalValue(form.endAt) : null,
        status: form.status,
        createdAt: now,
        updatedAt: now,
      };
      await set(newRef, payload);
      setForm(emptyForm());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: AuctionCatalogRow) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      summary: row.summary,
      description: row.description,
      startAt: toDateTimeLocalValue(row.startAt),
      endAt: row.endAt ? toDateTimeLocalValue(row.endAt) : "",
      status: row.status,
    });
  }

  async function onUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editingId || !form.title.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const now = Date.now();
      const prev = rows.find((r) => r.id === editingId);
      const payload: AuctionCatalogEntry = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        startAt: fromDateTimeLocalValue(form.startAt),
        endAt: form.endAt.trim() ? fromDateTimeLocalValue(form.endAt) : null,
        status: form.status,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      await set(ref(db, `auctions/catalog/${editingId}`), payload);
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function onDelete(id: string) {
    if (!confirm("确定删除该场次？将同时删除该场次下所有轮次数据；拍品节点请在「拍品」页单独处理。")) return;
    setErr("");
    try {
      await remove(ref(db, `auctions/rounds/${id}`));
      await remove(ref(db, `auctions/catalog/${id}`));
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
      <h1 className="admin-page-title">拍卖场次</h1>
      <p className="admin-page-desc">
        创建场次并填写日期、摘要与说明；数据写入 <code>auctions/catalog</code>。拍品可在「拍品与场次」中稍后关联。
      </p>

      {err ? <div className="error admin-auction-alert">{err}</div> : null}

      <section className="admin-card-block admin-auction-form-card">
        <h2 className="admin-card-block-title">{editingId ? "编辑场次" : "新建场次"}</h2>
        <form className="admin-auction-form" onSubmit={editingId ? onUpdate : onCreate}>
          <label className="admin-auction-label">
            标题 <span className="admin-auction-req">*</span>
            <input
              className="admin-auction-input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="例如：2025 春季艺术品拍卖会"
              required
            />
          </label>
          <label className="admin-auction-label">
            摘要（列表展示）
            <input
              className="admin-auction-input"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="一句话简介"
            />
          </label>
          <label className="admin-auction-label">
            详细说明
            <textarea
              className="admin-auction-textarea"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="场次介绍、预展信息等"
              rows={4}
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
            状态
            <select
              className="admin-auction-input"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as AuctionCatalogEntry["status"] }))
              }
            >
              <option value="draft">草稿（首页不展示）</option>
              <option value="scheduled">已排期</option>
              <option value="live">进行中</option>
              <option value="ended">已结束</option>
            </select>
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
                {saving ? "创建中…" : "创建场次"}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-card-block" style={{ marginTop: 24 }}>
        <h2 className="admin-card-block-title">已建场次</h2>
        {rows.length === 0 ? (
          <p className="admin-muted">暂无场次，请在上方创建。</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>开始时间</th>
                  <th>状态</th>
                  <th>轮次</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                      {r.summary ? (
                        <div className="admin-auction-cell-sub">{r.summary}</div>
                      ) : null}
                    </td>
                    <td>{formatAuctionDate(r.startAt)}</td>
                    <td>
                      <span className="admin-auction-badge">{r.status}</span>
                    </td>
                    <td>
                      <Link href={`/admin/auctions/${r.id}/rounds`} className="admin-auction-linkbtn" style={{ textDecoration: "none" }}>
                        管理轮次
                      </Link>
                    </td>
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

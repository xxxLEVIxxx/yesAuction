"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { get, push, ref, remove, set, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { parseLotImportFile, type ParsedLotRow } from "@/lib/importLotsFromSpreadsheet";
import {
  formatAuctionDate,
  parseCatalogRows,
  type AuctionCatalogRow,
} from "@/lib/auctionCatalog";
import type { AuctionRoundRow } from "@/lib/auctionRounds";
import { parseRoundRows, parseRoundsTree } from "@/lib/auctionRounds";

type LotRow = {
  id: string;
  auctionId?: string;
  roundId?: string;
  number?: string;
  title?: string;
  estimate?: string;
};

export function LotsAdminClient() {
  const [auctions, setAuctions] = useState<AuctionCatalogRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [auctionId, setAuctionId] = useState("");
  const [roundId, setRoundId] = useState("");
  const [rounds, setRounds] = useState<AuctionRoundRow[]>([]);
  const [roundsByAuction, setRoundsByAuction] = useState<Record<string, AuctionRoundRow[]>>({});
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("");
  const [importPreview, setImportPreview] = useState<{
    rows: ParsedLotRow[];
    errors: string[];
    sheetName: string;
    fileLabel: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [catSnap, lotsSnap, roundsSnap] = await Promise.all([
      get(ref(db, "auctions/catalog")),
      get(ref(db, "auctions/lots")),
      get(ref(db, "auctions/rounds")),
    ]);
    setRoundsByAuction(parseRoundsTree(roundsSnap.val()));
    const list = parseCatalogRows(catSnap.val());
    list.sort((a, b) => b.startAt - a.startAt);
    setAuctions(list);

    const raw = lotsSnap.val() as Record<string, Record<string, unknown>> | null;
    const lotRows: LotRow[] = [];
    if (raw) {
      for (const [id, v] of Object.entries(raw)) {
        lotRows.push({
          id,
          auctionId: typeof v.auctionId === "string" ? v.auctionId : undefined,
          roundId: typeof v.roundId === "string" ? v.roundId : undefined,
          number: v.number != null ? String(v.number) : undefined,
          title: v.title != null ? String(v.title) : undefined,
          estimate: v.estimate != null ? String(v.estimate) : undefined,
        });
      }
    }
    lotRows.sort((a, b) => (a.number || "").localeCompare(b.number || "", undefined, { numeric: true }));
    setLots(lotRows);
  }, []);

  useEffect(() => {
    if (!auctionId) {
      setRounds([]);
      setRoundId("");
      return;
    }
    let cancelled = false;
    get(ref(db, `auctions/rounds/${auctionId}`))
      .then((snap) => {
        if (cancelled) return;
        setRounds(parseRoundRows(snap.val()));
        setRoundId("");
      })
      .catch(() => {
        if (!cancelled) setRounds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [auctionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
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

  async function onAddLot(e: FormEvent) {
    e.preventDefault();
    if (!auctionId) {
      setErr("请选择所属场次");
      return;
    }
    if (!title.trim()) {
      setErr("请填写拍品标题");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const newRef = push(ref(db, "auctions/lots"));
      await set(newRef, {
        auctionId,
        ...(roundId ? { roundId } : {}),
        number: number.trim() || "—",
        title: title.trim(),
        estimate: estimate.trim() || "",
        createdAt: Date.now(),
      });
      setNumber("");
      setTitle("");
      setEstimate("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onPickImportFile(f: File | undefined) {
    if (!f) return;
    setErr("");
    setImportPreview(null);
    try {
      const { rows, errors, sheetName } = await parseLotImportFile(f);
      setImportPreview({
        rows,
        errors,
        sheetName,
        fileLabel: f.name,
      });
      if (rows.length === 0 && errors.length > 0) {
        setErr(errors[0] || "无法解析文件");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "解析失败");
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  async function onConfirmImport() {
    if (!importPreview || importPreview.rows.length === 0) return;
    if (!auctionId) {
      setErr("请先选择所属场次");
      return;
    }
    if (!roundId) {
      setErr("批量导入需指定所属轮次；若无轮次请先在「拍卖场次 → 管理轮次」创建。");
      return;
    }
    setImporting(true);
    setErr("");
    try {
      const now = Date.now();
      const updates: Record<string, unknown> = {};
      for (const row of importPreview.rows) {
        const newRef = push(ref(db, "auctions/lots"));
        const key = newRef.key;
        if (!key) continue;
        updates[`auctions/lots/${key}`] = {
          auctionId,
          roundId,
          number: row.number || "—",
          title: row.title,
          estimate: row.estimate || "",
          createdAt: now,
          source: "import",
        };
      }
      await update(ref(db), updates);
      setImportPreview(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  function downloadCsvTemplate() {
    const csv =
      "LOT,Title,Estimate\n" +
      "001,示例拍品 清 青花盘,$1,000 - 2,000\n" +
      "002,示例拍品 民国 粉彩瓶,$500 - 800\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lots-import-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onDeleteLot(id: string) {
    if (!confirm("确定删除该拍品？")) return;
    setErr("");
    try {
      await remove(ref(db, `auctions/lots/${id}`));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删除失败");
    }
  }

  function auctionTitle(aid: string | undefined) {
    if (!aid) return "—";
    const a = auctions.find((x) => x.id === aid);
    return a?.title || aid.slice(0, 8);
  }

  function roundLabel(aid: string | undefined, rid: string | undefined) {
    if (!aid || !rid) return "—";
    const list = roundsByAuction[aid] || [];
    const r = list.find((x) => x.id === rid);
    return r?.label || rid.slice(0, 8);
  }

  if (loading) {
    return <div className="admin-muted">加载中…</div>;
  }

  return (
    <>
      <h1 className="admin-page-title">拍品与场次</h1>
      <p className="admin-page-desc">
        拍品写入 <code>auctions/lots</code>，关联 <code>auctionId</code> 与可选的 <code>roundId</code>（轮次在「拍卖场次 →
        管理轮次」中维护）。当前上拍仍由 <code>auctions/current</code> 控制。
      </p>

      {err ? <div className="error admin-auction-alert">{err}</div> : null}

      <section className="admin-card-block admin-auction-form-card">
        <h2 className="admin-card-block-title">添加拍品（可稍后补充）</h2>
        {auctions.length === 0 ? (
          <p className="admin-muted">请先在「拍卖场次」中创建场次，再于此处添加拍品。</p>
        ) : (
          <form className="admin-auction-form" onSubmit={onAddLot}>
            <label className="admin-auction-label">
              所属场次
              <select
                className="admin-auction-input"
                value={auctionId}
                onChange={(e) => setAuctionId(e.target.value)}
                required
              >
                <option value="">选择场次…</option>
                {auctions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} — {formatAuctionDate(a.startAt)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-auction-label">
              所属轮次（可选，建议先在「拍卖场次 → 管理轮次」中创建 Day1/Day2）
              <select
                className="admin-auction-input"
                value={roundId}
                onChange={(e) => setRoundId(e.target.value)}
                disabled={!auctionId || rounds.length === 0}
              >
                <option value="">暂不指定 / 仅属整场</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} — {formatAuctionDate(r.startAt)}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-auction-row2">
              <label className="admin-auction-label">
                LOT 编号
                <input
                  className="admin-auction-input"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="例如：101"
                />
              </label>
              <label className="admin-auction-label">
                估价（可选）
                <input
                  className="admin-auction-input"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  placeholder="例如：$5,000–8,000"
                />
              </label>
            </div>
            <label className="admin-auction-label">
              标题 <span className="admin-auction-req">*</span>
              <input
                className="admin-auction-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="拍品名称"
                required
              />
            </label>
            <div className="admin-auction-actions">
              <button type="submit" className="admin-auction-btn primary" disabled={saving}>
                {saving ? "保存中…" : "添加拍品"}
              </button>
            </div>
          </form>
        )}
      </section>

      {auctions.length > 0 ? (
        <section className="admin-card-block admin-auction-form-card" style={{ marginTop: 24 }}>
          <h2 className="admin-card-block-title">批量导入（CSV / Excel）</h2>
          <p className="admin-page-desc" style={{ marginBottom: 12 }}>
            第一行为表头，需包含 <strong>标题</strong> 列（Title / 标题 / 名称 / 拍品 等）。可选列：LOT / 编号、Estimate /
            估价。导入的记录将写入当前选择的<strong>场次</strong>与<strong>轮次</strong>（请先在上方的「所属场次」「所属轮次」中选择，批量导入<strong>必须指定轮次</strong>）。
          </p>
          <div className="admin-auction-actions" style={{ marginBottom: 12 }}>
            <button type="button" className="admin-auction-btn secondary" onClick={downloadCsvTemplate}>
              下载 CSV 模板
            </button>
          </div>
          <label className="admin-auction-label">
            选择文件（.csv、.xlsx、.xls）
            <input
              ref={importFileRef}
              className="admin-auction-input"
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={(e) => onPickImportFile(e.target.files?.[0])}
            />
          </label>
          {importPreview ? (
            <div className="admin-import-preview" style={{ marginTop: 14 }}>
              <p className="admin-muted" style={{ marginBottom: 8 }}>
                文件：<strong>{importPreview.fileLabel}</strong>
                {importPreview.sheetName ? ` · 工作表：${importPreview.sheetName}` : ""} — 解析到{" "}
                <strong>{importPreview.rows.length}</strong> 条有效行
              </p>
              {importPreview.errors.length > 0 ? (
                <ul className="admin-import-warn">
                  {importPreview.errors.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {importPreview.errors.length > 8 ? <li>…共 {importPreview.errors.length} 条提示</li> : null}
                </ul>
              ) : null}
              {importPreview.rows.length > 0 ? (
                <div className="admin-table-wrap" style={{ marginTop: 10 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>LOT</th>
                        <th>标题</th>
                        <th>估价</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          <td>{r.number}</td>
                          <td>{r.title}</td>
                          <td>{r.estimate || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.rows.length > 8 ? (
                    <p className="admin-muted" style={{ marginTop: 8 }}>
                      仅预览前 8 行，导入时将写入全部 {importPreview.rows.length} 条。
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="admin-auction-actions" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="admin-auction-btn secondary"
                  onClick={() => setImportPreview(null)}
                  disabled={importing}
                >
                  清除
                </button>
                <button
                  type="button"
                  className="admin-auction-btn primary"
                  onClick={() => void onConfirmImport()}
                  disabled={importing || importPreview.rows.length === 0 || !auctionId || !roundId}
                >
                  {importing ? "导入中…" : `导入 ${importPreview.rows.length} 条到当前轮次`}
                </button>
              </div>
              {!roundId ? (
                <p className="auction-join-err" style={{ marginTop: 8 }}>
                  请先在上方选择「所属轮次」；若下拉为空，请先到「拍卖场次 → 管理轮次」添加 Day1/Day2 等。
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="admin-card-block" style={{ marginTop: 24 }}>
        <h2 className="admin-card-block-title">拍品目录</h2>
        {lots.length === 0 ? (
          <p className="admin-muted">暂无拍品。</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>LOT</th>
                  <th>标题</th>
                  <th>场次</th>
                  <th>轮次</th>
                  <th>估价</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td>{l.number || "—"}</td>
                    <td>{l.title || "—"}</td>
                    <td className="admin-cell-mono">{auctionTitle(l.auctionId)}</td>
                    <td>{roundLabel(l.auctionId, l.roundId)}</td>
                    <td>{l.estimate || "—"}</td>
                    <td>
                      <button type="button" className="admin-auction-linkbtn danger" onClick={() => onDeleteLot(l.id)}>
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

"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { get, push, ref, remove, set, update } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  buildEstimate,
  parseLotImportFile,
  type ParsedLotRow,
} from "@/lib/importLotsFromSpreadsheet";
import {
  formatAuctionDate,
  parseCatalogRows,
  type AuctionCatalogRow,
} from "@/lib/auctionCatalog";
import type { AuctionRoundRow } from "@/lib/auctionRounds";
import { parseRoundRows, parseRoundsTree } from "@/lib/auctionRounds";
import { lotBidPath, lotBidUrl } from "@/lib/lotBidUrls";

type LotRow = {
  id: string;
  auctionId?: string;
  roundId?: string;
  number?: string;
  title?: string;
  estimate?: string;
  website?: string;
  lowEst?: string;
  highEst?: string;
  startPrice?: string;
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
  const [website, setWebsite] = useState("");
  const [lowEst, setLowEst] = useState("");
  const [highEst, setHighEst] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [importPreview, setImportPreview] = useState<{
    rows: ParsedLotRow[];
    errors: string[];
    sheetName: string;
    fileLabel: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  /** "" = all auctions */
  const [exportAuctionFilter, setExportAuctionFilter] = useState("");

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
          website: v.website != null ? String(v.website) : undefined,
          lowEst: v.lowEst != null ? String(v.lowEst) : undefined,
          highEst: v.highEst != null ? String(v.highEst) : undefined,
          startPrice: v.startPrice != null ? String(v.startPrice) : undefined,
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
      const low = lowEst.trim();
      const high = highEst.trim();
      const single = estimate.trim();
      const estCombined = single || buildEstimate(low, high, "");
      const newRef = push(ref(db, "auctions/lots"));
      await set(newRef, {
        auctionId,
        ...(roundId ? { roundId } : {}),
        number: number.trim() || "—",
        title: title.trim(),
        estimate: estCombined,
        website: website.trim() || "",
        lowEst: low,
        highEst: high,
        startPrice: startPrice.trim() || "",
        createdAt: Date.now(),
      });
      setNumber("");
      setTitle("");
      setEstimate("");
      setWebsite("");
      setLowEst("");
      setHighEst("");
      setStartPrice("");
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
          website: row.website || "",
          lowEst: row.lowEst || "",
          highEst: row.highEst || "",
          startPrice: row.startPrice || "",
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
      "LOT,Title,website,LowEst,HighEst,StartPrice\n" +
      '001,"清 青花盘示例",https://theyesauction.com/products/example,1000,2000,500\n' +
      '002,"民国 粉彩瓶示例",,800,1200,400\n';
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

  async function onRemoveAllLots() {
    if (lots.length === 0) return;
    if (
      !confirm(
        `确定删除全部 ${lots.length} 条拍品？\n将清空数据库中的 auctions/lots，此操作不可恢复。`,
      )
    ) {
      return;
    }
    setErr("");
    setRemovingAll(true);
    try {
      await remove(ref(db, "auctions/lots"));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "清空失败");
    } finally {
      setRemovingAll(false);
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

  /** 估价：优先用已保存的 estimate，否则用 LowEst–HighEst 组合 */
  function displayEstimate(l: LotRow): string {
    const e = l.estimate?.trim();
    if (e) return e;
    return buildEstimate(l.lowEst?.trim() || "", l.highEst?.trim() || "", "");
  }

  const lotsForExport = exportAuctionFilter
    ? lots.filter((l) => l.auctionId === exportAuctionFilter)
    : lots;

  function exportBaseUrl() {
    if (typeof window === "undefined") return "";
    return process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, "") || window.location.origin;
  }

  function triggerDownload(filename: string, mime: string, body: string) {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvEscapeCell(s: string) {
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function onExportJson() {
    const base = exportBaseUrl();
    const generatedAt = new Date().toISOString();
    const payload = {
      generatedAt,
      baseUrl: base,
      note:
        "lotId = Firebase key at auctions/lots/{lotId}. bidPath is the site path for the pre-bid page; prepend baseUrl for absolute links.",
      lots: lotsForExport.map((l) => {
        const aid = l.auctionId || "";
        const path = aid ? lotBidPath(aid, l.id) : "";
        const url = aid && base ? lotBidUrl(base, aid, l.id) : "";
        return {
          lotId: l.id,
          lotNumber: l.number ?? "",
          auctionId: aid,
          auctionTitle: auctionTitle(l.auctionId),
          roundId: l.roundId ?? "",
          roundLabel: roundLabel(l.auctionId, l.roundId),
          title: l.title ?? "",
          bidPath: path,
          bidUrl: url,
        };
      }),
    };
    triggerDownload(
      `lot-mapping-${generatedAt.slice(0, 10)}.json`,
      "application/json;charset=utf-8",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  }

  function onExportCsv() {
    const base = exportBaseUrl();
    const headers = [
      "lotId",
      "lotNumber",
      "auctionId",
      "auctionTitle",
      "roundId",
      "roundLabel",
      "title",
      "bidPath",
      "bidUrl",
    ];
    const lines = [headers.join(",")];
    for (const l of lotsForExport) {
      const aid = l.auctionId || "";
      const path = aid ? lotBidPath(aid, l.id) : "";
      const url = aid && base ? lotBidUrl(base, aid, l.id) : "";
      const row = [
        l.id,
        l.number ?? "",
        aid,
        auctionTitle(l.auctionId),
        l.roundId ?? "",
        roundLabel(l.auctionId, l.roundId),
        l.title ?? "",
        path,
        url,
      ].map((c) => csvEscapeCell(String(c)));
      lines.push(row.join(","));
    }
    const generatedAt = new Date().toISOString();
    triggerDownload(
      `lot-mapping-${generatedAt.slice(0, 10)}.csv`,
      "text/csv;charset=utf-8",
      `\uFEFF${lines.join("\n")}\n`,
    );
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
        <h2 className="admin-card-block-title">导出 LOT ↔ lotId（外链预出价页）</h2>
        <p className="admin-page-desc" style={{ marginBottom: 12 }}>
          下载映射表，将官网或其他站点上的 <strong>LOT 编号</strong> 对应到本站 RTDB 的{" "}
          <code>lotId</code> 与预出价路径 <code>/auction/&#123;auctionId&#125;/lot/&#123;lotId&#125;</code>。
          可选按场次筛选；<code>bidUrl</code> 使用当前站点域名（或设置{" "}
          <code>NEXT_PUBLIC_APP_ORIGIN</code>）。
        </p>
        <div className="admin-auction-row2" style={{ marginBottom: 12 }}>
          <label className="admin-auction-label">
            导出范围
            <select
              className="admin-auction-input"
              value={exportAuctionFilter}
              onChange={(e) => setExportAuctionFilter(e.target.value)}
            >
              <option value="">全部场次（{lots.length} 条拍品）</option>
              {auctions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} — {lots.filter((x) => x.auctionId === a.id).length} 条
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-auction-actions">
          <button type="button" className="admin-auction-btn secondary" onClick={onExportJson}>
            下载 JSON
          </button>
          <button type="button" className="admin-auction-btn secondary" onClick={onExportCsv}>
            下载 CSV
          </button>
        </div>
      </section>

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
                官网链接 website（可选）
                <input
                  className="admin-auction-input"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
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
            <div className="admin-auction-row2">
              <label className="admin-auction-label">
                LowEst（可选）
                <input
                  className="admin-auction-input"
                  value={lowEst}
                  onChange={(e) => setLowEst(e.target.value)}
                  placeholder="低估价"
                />
              </label>
              <label className="admin-auction-label">
                HighEst（可选）
                <input
                  className="admin-auction-input"
                  value={highEst}
                  onChange={(e) => setHighEst(e.target.value)}
                  placeholder="高估价"
                />
              </label>
            </div>
            <div className="admin-auction-row2">
              <label className="admin-auction-label">
                StartPrice 起拍价（可选）
                <input
                  className="admin-auction-input"
                  value={startPrice}
                  onChange={(e) => setStartPrice(e.target.value)}
                  placeholder="例如：500"
                />
              </label>
              <label className="admin-auction-label">
                估价 Estimate（可选，可填整段；不填则用 LowEst–HighEst）
                <input
                  className="admin-auction-input"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  placeholder="例如：$5,000 – 8,000"
                />
              </label>
            </div>
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
            第一行为表头，需包含 <strong>Title</strong>（标题）列。推荐列名：<strong>LOT</strong>、<strong>Title</strong>、
            <strong>website</strong>、<strong>LowEst</strong>、<strong>HighEst</strong>、<strong>StartPrice</strong>
            （不区分大小写，亦支持英文变体如 Low Est、Start Price）。也可用单列 <strong>Estimate</strong> 作估价。导入将写入当前选择的<strong>场次</strong>与<strong>轮次</strong>（须先在上方的「所属场次」「所属轮次」中选择；<strong>必须指定轮次</strong>）。
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
                        <th>website</th>
                        <th>LowEst</th>
                        <th>HighEst</th>
                        <th>StartPrice</th>
                        <th>估价</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          <td>{r.number}</td>
                          <td>{r.title}</td>
                          <td className="admin-cell-mono">{r.website || "—"}</td>
                          <td>{r.lowEst || "—"}</td>
                          <td>{r.highEst || "—"}</td>
                          <td>{r.startPrice || "—"}</td>
                          <td>{r.estimate || buildEstimate(r.lowEst, r.highEst, "") || "—"}</td>
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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <h2 className="admin-card-block-title" style={{ margin: 0 }}>
            拍品目录
          </h2>
          {lots.length > 0 ? (
            <button
              type="button"
              className="admin-auction-btn secondary"
              style={{ color: "#b91c1c", borderColor: "#fecaca" }}
              disabled={removingAll}
              onClick={() => void onRemoveAllLots()}
            >
              {removingAll ? "清空中…" : "清空全部拍品"}
            </button>
          ) : null}
        </div>
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
                  <th>LowEst</th>
                  <th>HighEst</th>
                  <th>StartPrice</th>
                  <th>website</th>
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
                    <td>{displayEstimate(l) || "—"}</td>
                    <td>{l.lowEst || "—"}</td>
                    <td>{l.highEst || "—"}</td>
                    <td>{l.startPrice || "—"}</td>
                    <td className="admin-cell-mono">
                      {l.website ? (
                        <a href={l.website} target="_blank" rel="noopener noreferrer" className="admin-erp-site-link">
                          链接
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
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

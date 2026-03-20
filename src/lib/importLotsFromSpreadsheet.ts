import * as XLSX from "xlsx";

/** Parsed row from CSV/XLSX (headers matched flexibly). */
export type ParsedLotRow = {
  number: string;
  title: string;
  website: string;
  lowEst: string;
  highEst: string;
  startPrice: string;
  /** Combined display / legacy single “Estimate” column */
  estimate: string;
};

function normCell(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Match column header text (Chinese / English). */
function colIndex(headers: string[], regexes: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (!h) continue;
    if (regexes.some((re) => re.test(h))) return i;
  }
  return -1;
}

const RE_LOT =
  /^(lot|lot\s+no|lotno|lot\s+number|lot\s*#|no\.?|number|#|编号|lot号|拍品号)$/i;
const RE_TITLE = /^(title|名称|标题|拍品名称|拍品|description|name|品名)$/i;
const RE_WEB = /^(website|url|链接|link|网址|网站|网页)$/i;
/** LowEst, Low Est, Low Estimate, lowest, 低估价 … */
const RE_LOW =
  /^(lowest|low\s*est|low_est|low estimate|low\s+estimate|低估|低估价)$/i;
/** HighEst, High Est, High Estimate, highest, 高估价 … */
const RE_HIGH =
  /^(highest|high\s*est|high_est|high estimate|high\s+estimate|高估|高估价)$/i;
const RE_START = /^(startprice|start\s*price|起拍|起拍价|起标价)$/i;
/** Single combined estimate column (optional if Low/High present) */
const RE_EST_SINGLE = /^(estimate|估价|价格|price)$/i;

/** Exported for admin UI: show 估价 when only low/high are stored */
export function buildEstimate(low: string, high: string, single: string): string {
  if (single) return single;
  if (low && high) return `${low} – ${high}`;
  if (low) return low;
  if (high) return high;
  return "";
}

/**
 * First row = headers. Required: Title. LOT optional.
 * Prefers: website, LowEst, HighEst, StartPrice; fallback single Estimate.
 */
export function parseRowsFromMatrix(rows: unknown[][]): { ok: ParsedLotRow[]; errors: string[] } {
  const errors: string[] = [];
  if (!rows.length) {
    errors.push("文件为空");
    return { ok: [], errors };
  }

  const headerRow = (rows[0] || []).map((c) => normCell(c));
  const iLot = colIndex(headerRow, [RE_LOT]);
  const iTitle = colIndex(headerRow, [RE_TITLE]);
  const iWeb = colIndex(headerRow, [RE_WEB]);
  const iLow = colIndex(headerRow, [RE_LOW]);
  const iHigh = colIndex(headerRow, [RE_HIGH]);
  const iStart = colIndex(headerRow, [RE_START]);
  const iEst = colIndex(headerRow, [RE_EST_SINGLE]);

  if (iTitle < 0) {
    errors.push("未找到「标题」列：请使用 Title / 标题 / 名称 / 拍品 等。");
    return { ok: [], errors };
  }

  const ok: ParsedLotRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r] as unknown[];
    if (!line || line.every((c) => !normCell(c))) continue;

    const title = normCell(line[iTitle]);
    if (!title) {
      errors.push(`第 ${r + 1} 行：标题为空，已跳过`);
      continue;
    }

    const number = iLot >= 0 ? normCell(line[iLot]) : String(r);
    const website = iWeb >= 0 ? normCell(line[iWeb]) : "";
    const lowEst = iLow >= 0 ? normCell(line[iLow]) : "";
    const highEst = iHigh >= 0 ? normCell(line[iHigh]) : "";
    const startPrice = iStart >= 0 ? normCell(line[iStart]) : "";
    const singleEst = iEst >= 0 ? normCell(line[iEst]) : "";
    const estimate = buildEstimate(lowEst, highEst, singleEst);

    ok.push({
      number: number || String(r),
      title,
      website,
      lowEst,
      highEst,
      startPrice,
      estimate,
    });
  }

  if (ok.length === 0 && errors.length === 0) {
    errors.push("没有可导入的数据行（除表头外为空）");
  }

  return { ok, errors };
}

export async function parseLotImportFile(file: File): Promise<{
  rows: ParsedLotRow[];
  errors: string[];
  sheetName: string;
}> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv") || file.type === "text/csv";

  let workbook: XLSX.WorkBook;
  if (isCsv) {
    const text = await file.text();
    workbook = XLSX.read(text, { type: "string", raw: false });
  } else {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: "array", raw: false });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["文件中没有工作表"], sheetName: "" };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  const { ok, errors } = parseRowsFromMatrix(matrix);
  return { rows: ok, errors, sheetName };
}

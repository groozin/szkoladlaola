/**
 * Extracts raw rows from open-days.pdf: { schoolId, rawDateText }[].
 *
 * Uses pdfjs-dist. Each page yields text items with (x, y) positions.
 * We cluster items into rows by y-coordinate, then identify which rows
 * belong to which school by matching the left-column text against the
 * known set of school ids from scripts/addresses-seed.json.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Legacy build works in plain Node without a canvas polyfill.
// @ts-ignore - no bundled types for the legacy subpath
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export type RawRow = { schoolId: string; rawDateText: string };

type PdfTextItem = {
  str: string;
  transform: number[]; // [a, b, c, d, e=x, f=y]
};

type LineItem = { x: number; text: string };
type Line = { y: number; items: LineItem[] };

// School ids live as keys in addresses-seed.json — load once.
const seed = JSON.parse(
  await readFile(resolve(__dirname, "addresses-seed.json"), "utf8"),
) as Record<string, { fullName: string; address: string; postalCode: string }>;

// Sort longest-first so "XVIII LO" wins over "XVII LO" and the multi-word
// private schools match before any Roman-numeral id inside their name.
const SCHOOL_IDS = Object.keys(seed).sort((a, b) => b.length - a.length);

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function matchSchoolId(text: string): string | null {
  const t = norm(text);
  for (const id of SCHOOL_IDS) {
    const n = norm(id);
    if (t === n || t.startsWith(n + " ")) return id;
  }
  return null;
}

export async function parsePdf(pdfPath: string): Promise<RawRow[]> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const allLines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as unknown[]).filter(
      (i): i is PdfTextItem =>
        typeof (i as PdfTextItem).str === "string" &&
        Array.isArray((i as PdfTextItem).transform),
    );

    // Offset y per page so later pages sort after earlier ones.
    const pageOffset = -p * 10000;

    // Cluster items into lines by y (rounded — PDF coords are floats).
    const byY = new Map<number, LineItem[]>();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]);
      const key = y;
      const bucket = byY.get(key) ?? [];
      bucket.push({ x, text: it.str });
      byY.set(key, bucket);
    }

    // Sort items within each line left-to-right, then sort lines top-to-bottom
    // (PDF y grows upward, so larger y first).
    const pageLines: Line[] = [...byY.entries()]
      .map(([y, arr]) => ({
        y: pageOffset + y,
        items: arr.sort((a, b) => a.x - b.x),
      }))
      .sort((a, b) => b.y - a.y);

    allLines.push(...pageLines);
  }

  // Walk lines, splitting by detected school id in the left column.
  // Left column ≈ x < 170 (header "Nr LO" lives there); dates are on the right.
  //
  // Three cases per line:
  //   (1) left alone matches an id    — a new row starts here; drop any stale
  //                                     accumulation (e.g. page/table headers).
  //   (2) accumulated-left matches    — a multi-line label (private schools)
  //                                     ends on this line; the accumulated
  //                                     right is this row's date cell.
  //   (3) right-only or unmatched     — extend the pending row's dates or keep
  //                                     accumulating for the next label.
  const rows: RawRow[] = [];
  let pending: RawRow | null = null;
  let tentativeLeft = "";
  let tentativeRight = "";

  const commit = (id: string, dates: string) => {
    if (pending) rows.push(pending);
    pending = { schoolId: id, rawDateText: dates };
    tentativeLeft = "";
    tentativeRight = "";
  };

  for (const line of allLines) {
    const leftCol = line.items.filter((i) => i.x < 170).map((i) => i.text).join(" ").trim();
    const rightCol = line.items.filter((i) => i.x >= 170).map((i) => i.text).join(" ").trim();
    if (!leftCol && !rightCol) continue;

    if (!leftCol) {
      // Right-only line → continuation of pending row's date cell.
      // (Cast works around TS's closure-narrowing of `pending`; `commit` assigns to it via closure.)
      const p = pending as RawRow | null;
      if (p) p.rawDateText = norm(p.rawDateText + " " + rightCol);
      continue;
    }

    const directId = matchSchoolId(leftCol);
    if (directId) {
      commit(directId, rightCol);
      continue;
    }

    tentativeLeft = norm(tentativeLeft + " " + leftCol);
    tentativeRight = norm(tentativeRight + " " + rightCol);
    const accumId = matchSchoolId(tentativeLeft);
    if (accumId) commit(accumId, tentativeRight);
  }
  if (pending) rows.push(pending);

  // Deduplicate (the PDF lists XLII LO twice) — last occurrence wins for that key.
  const dedup = new Map<string, RawRow>();
  for (const r of rows as RawRow[]) dedup.set(r.schoolId, r);
  return [...dedup.values()];
}

// Allow direct invocation for quick inspection: `tsx scripts/parse-pdf.ts`
const isMain = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "");
if (isMain) {
  const rows = await parsePdf(resolve(__dirname, "..", "open-days.pdf"));
  console.log(JSON.stringify(rows, null, 2));
  console.log(`\n-> ${rows.length} schools`);
}

/**
 * Scrapers for otouczelnie.pl — the Kraków liceum index and per-school detail.
 *
 * All HTTP calls go through cachedGet, so re-runs are free once pages have
 * been fetched into .cache/otouczelnie/.
 */
import { load, type CheerioAPI } from "cheerio";
import { cachedGet } from "./http-cache.ts";

const INDEX_URL =
  "https://www.otouczelnie.pl/artykul/208/Licea-publiczne-i-prywatne-w-Krakowie-wyszukiwarka";

const DETAIL_ID_RE = /\/208\/[^/]+\/(\d+)\/([^/?#]+)/;
// Class heading: "Klasa 1A (profile)" or "1A (profile)". Code is alphanumeric,
// up to 5 chars, must start with a digit.
const CLASS_HEADING_RE = /^(?:Klasa\s+)?(\d[A-ZŻŹĆĄŚĘŁÓŃ]{1,5})\s*(?:\(([^)]+)\))?\s*$/;

export type IndexEntry = {
  otouczelnieId: number;
  url: string;
  slug: string;
  name: string;                 // "I LO im. Bartłomieja Nowodworskiego"
  district: string | null;
  street: string;               // "pl. Plac Na Groblach 9"
  isPublic: boolean;
  isAdult: boolean;
};

// ---------- index --------------------------------------------------

export async function scrapeIndex(): Promise<IndexEntry[]> {
  const html = await cachedGet(INDEX_URL, "otouczelnie/index.html");
  const $ = load(html);
  const entries: IndexEntry[] = [];
  const seen = new Set<number>();

  $("div.dktp").each((_, el) => {
    const card = $(el);
    const href =
      card.find("h2.miasto-nazwa").closest("a").first().attr("href") ??
      card.find("a[href*='/artykul/208/']").first().attr("href");
    if (!href) return;
    const m = href.match(DETAIL_ID_RE);
    if (!m) return;
    const otouczelnieId = Number(m[1]);
    if (seen.has(otouczelnieId)) return;
    seen.add(otouczelnieId);

    const name = card.find("h2.miasto-nazwa span").first().text().trim();
    if (!name) return;

    const addressRaw = card.find("span.address").first().text().replace(/\s+/g, " ").trim();
    let district: string | null = null;
    let street = addressRaw;
    const parts = addressRaw.split("•");
    if (parts.length === 2) {
      street = parts[1].trim();
      const left = parts[0].replace(/,?\s*Kraków\s*,?$/i, "").replace(/,$/, "").trim();
      district = left || null;
    }

    const typeText = card.find("span.type").first().text().trim().toLowerCase();
    const isPublic = typeText.includes("publiczna") && !typeText.includes("niepubliczna");

    const nameLower = name.toLowerCase();
    const isAdult =
      /dla\s+doros[łl]ych|zaoczn|wieczorow|dla\s+pracuj/.test(nameLower) ||
      /centrum\s+kszta[łl]cenia/.test(nameLower);

    entries.push({
      otouczelnieId,
      url: href,
      slug: m[2],
      name,
      district,
      street,
      isPublic,
      isAdult,
    });
  });

  return entries;
}

// ---------- per-school detail --------------------------------------

export type DetailClass = {
  code: string;                     // "1A", "1AMK"
  profile: string | null;
  extendedSubjects: string[];
  recruitmentSubjects: string[];
  languages: string[];
};

export type SchoolDetail = {
  website: string | null;
  year: string | null;
  classes: DetailClass[];
};

const splitCommaList = (s: string) =>
  s
    .replace(/\*+/g, "")
    .split(",")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length > 0);

export async function scrapeDetail(entry: IndexEntry): Promise<SchoolDetail> {
  const html = await cachedGet(
    entry.url,
    `otouczelnie/school/${entry.otouczelnieId}/main.html`,
  );
  const $ = load(html);

  const website = $("a[title='Strona szkoły']").first().attr("href") ?? null;
  const year = activeYear($);
  const classes = extractClasses($);

  return { website, year, classes };
}

function activeYear($: CheerioAPI): string | null {
  const el = $("a.submenu-entry.active, .submenu-entry.active").first();
  if (el.length) {
    const t = el.text().replace(/\s+/g, " ").trim();
    const m = t.match(/20\d{2}\/20\d{2}/);
    if (m) return m[0];
  }
  // Fallback: first year mention anywhere.
  const m2 = $("body").text().match(/20\d{2}\/20\d{2}/);
  return m2 ? m2[0] : null;
}

function extractClasses($: CheerioAPI): DetailClass[] {
  const classes: DetailClass[] = [];

  $("div.desktop_kafelek").each((_, blk) => {
    const block = $(blk);
    const heading = block.find("h2").first().text().replace(/\s+/g, " ").trim();
    const m = heading.match(CLASS_HEADING_RE);
    if (!m) return;
    const code = m[1];
    const profile = m[2]?.trim() || null;

    // Extended subjects: <span class="normal-line"><strong>Przedmioty rozszerzone:</strong><br>...</span>
    let extSubjects: string[] = [];
    block.find("span.normal-line").each((_, span) => {
      const txt = $(span).text().replace(/\s+/g, " ").trim();
      const mm = txt.match(/^Przedmioty\s+rozszerzone:\s*(.*)$/i);
      if (mm && extSubjects.length === 0) extSubjects = splitCommaList(mm[1]);
    });

    // Languages: <span class="normal-line tryb">Języki: ... </span>
    let languages: string[] = [];
    block.find("span.normal-line.tryb, span.normal-line").each((_, span) => {
      const txt = $(span).text().replace(/\s+/g, " ").trim();
      const mm = txt.match(/^J(?:ę|e)zyki:\s*(.*)$/i);
      if (mm && languages.length === 0) languages = splitCommaList(mm[1]);
    });

    // Recruitment subjects: div.wymagania-rekrutacyjne > p.subjects
    const recText = block
      .find("div.wymagania-rekrutacyjne p.subjects")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const recSubjects = recText ? splitCommaList(recText) : [];

    if (!extSubjects.length && !languages.length && !recSubjects.length) return;

    classes.push({
      code,
      profile,
      extendedSubjects: extSubjects,
      recruitmentSubjects: recSubjects,
      languages,
    });
  });

  return classes;
}

// ---------- thresholds (/progi-punktowe) ---------------------------

export type ThresholdRow = { classCode: string; pointsMin: number };

export async function scrapeThresholds(
  entry: IndexEntry,
): Promise<{ sourceUrl: string; year: string | null; rows: ThresholdRow[] }> {
  const url = entry.url.replace(/\/$/, "") + "/progi-punktowe";
  const html = await cachedGet(
    url,
    `otouczelnie/school/${entry.otouczelnieId}/progi-punktowe.html`,
  );
  const $ = load(html);

  const year = activeYear($);

  const rows: ThresholdRow[] = [];
  const seen = new Set<string>();
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 2) return;
    const labelText = $(tds[0]).text().replace(/\s+/g, " ").trim();
    const valueText = $(tds[1]).text().replace(/\s+/g, " ").trim();
    const mLabel = labelText.match(CLASS_HEADING_RE);
    if (!mLabel) return;
    const code = mLabel[1];
    if (/brak\s+danych/i.test(valueText)) return;
    const n = Number(valueText.replace(",", "."));
    if (!Number.isFinite(n)) return;
    if (seen.has(code)) return;
    seen.add(code);
    rows.push({ classCode: code, pointsMin: n });
  });

  return { sourceUrl: url, year, rows };
}

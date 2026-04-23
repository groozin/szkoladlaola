/**
 * Fetches the Perspektywy 2025 Małopolska liceum ranking via their API and
 * extracts per-school regional + national rank for Kraków schools.
 *
 * The public page at 2025.licea.perspektywy.pl is a React SPA; the data comes
 * from api.perspektywy.pl. We go straight to the API — much cheaper than
 * rendering the page, and the response is plain JSON.
 *
 * Two hops are needed: the edition document maps slugs → ranking ids, then
 * each id yields the rows. Both responses are cached under
 * .cache/perspektywy/ so reruns are free.
 */
import { cachedGet } from "./http-cache.ts";

const EDITION_URL = "https://api.perspektywy.pl/v1/ranking/edition/ranking-liceow-2025";
const RANKING_URL = (id: string) => `https://api.perspektywy.pl/v1/rankings/${id}`;

export type PerspektywyRow = {
  rankMalopolska: number;      // `place` in API
  rankPoland: number | null;   // `place_2025` — may be absent for low-ranked schools
  name: string;                // cleaned — HTML stripped
  city: string;
};

type EditionResponse = { rankings: Record<string, string> };
type RankingResponse = {
  rank: Array<{
    place: number;
    name: string;               // may contain HTML (<a href=...>...</a>)
    city: string;
    place_2025?: string | null; // national rank, string like "2" or "12-15"
  }>;
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function parseRank(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Download Małopolska rows, filtered to Kraków. */
export async function scrapePerspektywyMalopolska(): Promise<PerspektywyRow[]> {
  const editionRaw = await cachedGet(EDITION_URL, "perspektywy/edition.json");
  const edition = JSON.parse(editionRaw) as EditionResponse;
  const id = edition.rankings["ranking-malopolski"];
  if (!id) throw new Error("ranking-malopolski not found in Perspektywy edition index");

  const raw = await cachedGet(RANKING_URL(id), "perspektywy/malopolski.json");
  const data = JSON.parse(raw) as RankingResponse;

  return data.rank
    .filter((r) => r.city === "Kraków")
    .map((r) => ({
      rankMalopolska: r.place,
      rankPoland: parseRank(r.place_2025),
      name: stripHtml(r.name),
      city: r.city,
    }));
}

/** Normalise a school name for fuzzy comparison: expand "Liceum
 *  Ogólnokształcące" → "lo", drop the redundant " w Krakowie" suffix
 *  ubiquitous on otouczelnie names, collapse abbreviations, lowercase,
 *  strip punctuation. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/liceum\s+og[óo]lnokszta[łl]c[ąa]ce/g, "lo")
    .replace(/\s+w\s+krakowie\b/g, "")
    .replace(/oddz\.\s*/g, "oddziałem ")
    .replace(/dwuj[ęe]z\./g, "dwujęzycznym")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a Perspektywy row to one of our school ids via several strategies:
 *   1. normalised Perspektywy name equals normalised id or full_name
 *   2. normalised Perspektywy starts with normalised id + " "      (our id is short prefix)
 *   3. normalised full_name starts with normalised Perspektywy + " " (Perspektywy is short prefix)
 */
export function matchSchool(
  perspektywyName: string,
  schools: Array<{ id: string; fullName: string }>,
): string | null {
  const p = normName(perspektywyName);
  const sorted = [...schools].sort((a, b) => b.id.length - a.id.length);

  for (const s of sorted) {
    if (normName(s.id) === p) return s.id;
    if (normName(s.fullName) === p) return s.id;
  }
  for (const s of sorted) {
    if (p.startsWith(normName(s.id) + " ")) return s.id;
  }
  for (const s of sorted) {
    if (normName(s.fullName).startsWith(p + " ")) return s.id;
  }
  return null;
}

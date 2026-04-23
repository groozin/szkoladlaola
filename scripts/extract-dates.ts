/**
 * Pulls ISO dates out of the Polish free-text schedule strings in the PDF.
 *
 * Handles:
 *   "22.05.2026 r."                   → ["2026-05-22"]
 *   "11.04.2026 r. , 15.05.2026 r."   → ["2026-04-11", "2026-05-15"]
 *   "16-17.04.2026"                   → ["2026-04-16", "2026-04-17"]
 *   "20.03.26 (piątek) 11.00-14.00"   → ["2026-03-20"]  (2-digit year -> 2000+)
 *   "22.04. 2026 …"                   → ["2026-04-22"]  (stray space)
 */
const RANGE_RE = /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g;
const DATE_RE = /\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})\b/g;

const iso = (y: number, m: number, d: number) =>
  `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;

const normalizeYear = (y: number) => (y < 100 ? 2000 + y : y);

export function extractDates(text: string): string[] {
  const out = new Set<string>();

  // Some PDF rows come out with stray spaces between characters
  // (e.g. "1 8 .0 4 .2026"). Collapsing those lets the regex match — but the
  // same substitution can glue a year onto a following time ("2026 10:00" →
  // "202610:00") and break detection, so we scan the original AND cleaned
  // strings and union the hits.
  const cleaned = text.replace(/(\d)\s+(?=[\d.])/g, "$1");

  const scan = (s: string) => {
    // Expand day ranges first so they don't get picked up as a single date.
    const expanded = s.replace(RANGE_RE, (_, d1, d2, mo, yr) => {
      const m = Number(mo);
      const y = normalizeYear(Number(yr));
      const start = Number(d1);
      const end = Number(d2);
      const parts: string[] = [];
      for (let d = start; d <= end; d++) parts.push(`${d}.${m}.${y}`);
      return parts.join(" ");
    });

    for (const match of expanded.matchAll(DATE_RE)) {
      const d = Number(match[1]);
      const m = Number(match[2]);
      const y = normalizeYear(Number(match[3]));
      // Sanity filter — PDF is for year 2026; year cuts off 1900-era OCR noise.
      if (y < 2020 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) continue;
      out.add(iso(y, m, d));
    }
  };

  scan(text);
  if (cleaned !== text) scan(cleaned);
  return [...out].sort();
}

// Quick self-check when invoked directly.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const cases = [
    "22.05.2026 r.",
    "11.04.2026 r. , 15.05.2026 r.",
    "16-17.04.2026",
    "20.03.26 (piątek) 11.00-14.00",
    "22.04. 2026 w godzinach 17:30–19:00",
    "24.04.2026 godz. 15:00 - 18:00 Dzień Otwarty; 9.04.2026 godz. 16:30 - Spotkanie",
    "20.03.26 ( piątek) 11.00 -14.00 21.03.26 ( sobota) 10.00-13.00 22.05.26. (piątek) 11.00-14.00 23.05.26 ( sobota) 10.00-14.00",
  ];
  for (const c of cases) console.log(JSON.stringify(c), "→", extractDates(c));
}

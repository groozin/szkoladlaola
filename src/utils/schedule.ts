/**
 * Extract just the portion of a raw PDF schedule string that pertains to a
 * specific ISO date. Best-effort — find the first date in the raw text
 * matching the ISO date (accepting stray whitespace and 2- or 4-digit
 * years), then slice up to the next date (or end of string).
 *
 * Examples:
 *   raw = "24.04.2026 godz. 15:00 - 18:00 Dzień Otwarty; 9.04.2026 godz. 16:30 - Spotkanie…"
 *   scheduleForDate(raw, "2026-04-24") → "godz. 15:00 - 18:00 Dzień Otwarty"
 *   scheduleForDate(raw, "2026-04-09") → "godz. 16:30 - Spotkanie…"
 */
export function scheduleForDate(raw: string, iso: string): string {
  if (!raw) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const yy = y.toString().slice(2);

  // Match d.m.yyyy or d.m.yy — leading zeros optional, stray whitespace
  // after the dots tolerated (PDF quirks: "22.04. 2026"). Digit lookarounds
  // prevent matching inside a larger number.
  const dateRe = new RegExp(
    `(?<![0-9])0?${d}\\.\\s*0?${m}\\.\\s*(?:${y}|${yy})(?![0-9])`,
  );
  const match = raw.match(dateRe);
  if (!match || match.index == null) return "";

  const after = raw.slice(match.index + match[0].length);
  // Stop at the next date-ish token so multi-date rows don't bleed together.
  const nextIdx = after.search(/\d{1,2}\.\s*\d{1,2}\.\s*(?:20)?\d{2}/);
  let desc = nextIdx === -1 ? after : after.slice(0, nextIdx);

  desc = desc
    .replace(/^\s*r\.\s*/, "")
    .replace(/^[,;:]\s*/, "")
    .replace(/[,;]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return desc;
}

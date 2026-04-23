/**
 * If id matches "<Roman numeral> LO", return the Arabic number.
 * Otherwise null (for private schools like "LO św.Rity").
 */
export function romanToArabic(id: string): number | null {
  const m = id.match(/^([IVXLCDM]+)\s+LO$/);
  if (!m) return null;
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const s = m[1];
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = map[s[i]];
    const next = map[s[i + 1]];
    total += next && next > cur ? -cur : cur;
  }
  return total;
}

/** Id with Arabic numeral inserted between the Roman numeral and "LO", e.g.
 *  "XVIII LO" → "XVIII (18) LO". Private schools are returned unchanged. */
export function displayId(id: string): string {
  const m = id.match(/^([IVXLCDM]+)\s+LO$/);
  if (!m) return id;
  const n = romanToArabic(id);
  return n != null ? `${m[1]} (${n}) LO` : id;
}

/** Short label shown *inside* a map marker — Arabic number for the numbered
 *  schools, and a terse tag for the three private ones. */
export function markerLabel(id: string): string {
  const n = romanToArabic(id);
  if (n != null) return String(n);
  if (id.includes("św.Rity")) return "Rita";
  if (id.includes("Salezjańskie")) return "Sal";
  if (id.includes("Pallotyńskie")) return "Pal";
  return id.slice(0, 4);
}

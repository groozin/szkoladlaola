/**
 * End-to-end offline pipeline:
 *   parse PDF → attach seeded addresses → geocode via Nominatim → apply
 *   manual overrides → emit src/data/schools.json for the web app.
 *
 * Run: `npm run build-data`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePdf } from "./parse-pdf.ts";
import { extractDates } from "./extract-dates.ts";
import { geocodeAll, type GeoResult } from "./geocode.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

type SeedEntry = { fullName: string; address: string; postalCode: string };
type OverrideEntry = { lat?: number; lon?: number; address?: string };

export type School = {
  id: string;
  fullName: string;
  address: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
  openDays: string[];       // ISO YYYY-MM-DD, sorted asc
  rawSchedule: string;      // original Polish free text
};

const readJson = async <T>(p: string) => JSON.parse(await readFile(p, "utf8")) as T;

async function main() {
  console.log("[1/4] Parsing PDF…");
  const rows = await parsePdf(resolve(ROOT, "open-days.pdf"));
  console.log(`      ${rows.length} rows`);

  const seed = await readJson<Record<string, SeedEntry>>(
    resolve(__dirname, "addresses-seed.json"),
  );
  const overridesRaw = await readJson<Record<string, OverrideEntry | string>>(
    resolve(__dirname, "addresses-override.json"),
  );
  const overrides: Record<string, OverrideEntry> = {};
  for (const [k, v] of Object.entries(overridesRaw)) {
    if (k.startsWith("_") || typeof v !== "object") continue;
    overrides[k] = v;
  }

  console.log("[2/4] Geocoding addresses…");
  const geoInputs = rows.map((r) => {
    const s = seed[r.schoolId];
    if (!s) throw new Error(`No seed entry for "${r.schoolId}"`);
    const addr = overrides[r.schoolId]?.address ?? s.address;
    // Nominatim dislikes the "ul." prefix — strip it for fallback queries.
    const addrNoPrefix = addr.replace(/^(ul\.|al\.|pl\.|os\.)\s*/i, "");
    const queries = [
      `${addr}, ${s.postalCode} Kraków, Polska`,
      `${addr}, Kraków, Polska`,
      `${addrNoPrefix}, Kraków, Polska`,
      `${s.fullName}, Kraków, Polska`,
    ];
    // De-dupe while preserving order.
    return { key: r.schoolId, queries: [...new Set(queries)] };
  });
  const geo = await geocodeAll(geoInputs);

  console.log("[3/4] Building records…");
  const schools: School[] = rows.map((r) => {
    const s = seed[r.schoolId];
    const ov = overrides[r.schoolId] ?? {};
    const g: GeoResult | null = geo.get(r.schoolId) ?? null;
    const lat = ov.lat ?? g?.lat ?? null;
    const lon = ov.lon ?? g?.lon ?? null;
    if (lat == null || lon == null) {
      console.warn(`      ! no coordinates for "${r.schoolId}"`);
    }
    return {
      id: r.schoolId,
      fullName: s.fullName,
      address: ov.address ?? s.address,
      postalCode: s.postalCode,
      lat,
      lon,
      openDays: extractDates(r.rawDateText),
      rawSchedule: r.rawDateText,
    };
  });
  // Stable order: Roman-numeral schools by numeric value, then private ones by name.
  schools.sort((a, b) => {
    const na = romanValue(a.id);
    const nb = romanValue(b.id);
    if (na == null && nb == null) return a.id.localeCompare(b.id);
    if (na == null) return 1;
    if (nb == null) return -1;
    return na - nb;
  });

  console.log("[4/4] Writing src/data/schools.json…");
  const outDir = resolve(ROOT, "src", "data");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    resolve(outDir, "schools.json"),
    JSON.stringify(schools, null, 2) + "\n",
  );

  const missingGeo = schools.filter((s) => s.lat == null || s.lon == null).length;
  console.log(`\n✓ Done. ${schools.length} schools written. Missing geo: ${missingGeo}.`);
}

function romanValue(id: string): number | null {
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * End-to-end offline pipeline. Builds a SQLite knowledge base under
 * data/schools.db and denormalises the slices the frontend consumes into
 * JSON.
 *
 * Phases (each is idempotent):
 *   1a  open-days.pdf + addresses-seed → schools + open_days
 *   2   otouczelnie index              → merge in new schools, backfill district/website/is_public
 *   1b  Nominatim geocoding            → fill missing coords (runs after #2 so new schools get coords)
 *   1c  landmarks-seed                 → landmarks table
 *   3   otouczelnie detail pages       → classes (for the recruitment year otouczelnie shows)
 *   4   otouczelnie /progi-punktowe    → thresholds (latest year with data)
 *   5   exportJson                     → src/data/*.json for the frontend
 *
 * All HTTP is cached under .cache/, so reruns are network-free.
 * Run: `npm run build-data`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePdf } from "./parse-pdf.ts";
import { extractDates } from "./extract-dates.ts";
import { geocodeAll } from "./geocode.ts";
import { openDb, resetDataTables, runMigrations, type Db } from "./db.ts";
import {
  scrapeDetail,
  scrapeIndex,
  scrapeThresholds,
  type IndexEntry,
} from "./scrape-otouczelnie.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

type SeedEntry = { fullName: string; address: string; postalCode: string };

const readJson = async <T>(p: string) => JSON.parse(await readFile(p, "utf8")) as T;

/** Roman → Arabic for ids like "XVIII LO". Null for private-school ids. */
function romanValue(id: string): number | null {
  const m = id.match(/^([IVXLCDM]+)\s+LO/);
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

/** Canonicalise addresses so we can match schools across sources despite
 *  cosmetic differences like "Plac na Groblach" vs "pl. Plac Na Groblach"
 *  or "os. Wysokie 6" vs "os. Osiedle Wysokie 6". */
function normalizeAddress(a: string): string {
  let s = a
    .toLowerCase()
    .replace(/[-_/]/g, " ")          // "Wilka-Wyrwińskiego" → "Wilka Wyrwińskiego"
    .replace(/\s+/g, " ")
    .trim();
  // Abbreviations require the dot so they don't eat prefixes of longer words
  // (e.g. "os" stripped from "osiedle"). Full words strip with their space.
  const PREFIXES = /^(aleja|aleje|plac|osiedle|ul\.|al\.|pl\.|os\.)\s*/;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(PREFIXES, "");
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Addresses match if exactly equal after normalization, or if one is a
 *  suffix of the other — handles cases where one source omits the first
 *  name (e.g. "Skarbińskiego 5" vs "Stanisława Skarbińskiego 5"). */
function addressesMatch(a: string, b: string): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 6 && longer.endsWith(" " + shorter);
}

// ---------- Phase 1a: PDF → DB ---------------------------------------

async function phaseSeedFromPdf(db: Db) {
  console.log("[phase 1a] PDF → SQLite");
  const rows = await parsePdf(resolve(ROOT, "open-days.pdf"));
  const seed = await readJson<Record<string, SeedEntry>>(
    resolve(__dirname, "addresses-seed.json"),
  );

  const insertSchool = db.prepare(`
    INSERT INTO schools (id, full_name, arabic_number, address, postal_code,
                         is_public, in_pdf, pdf_raw_schedule)
    VALUES (@id, @full_name, @arabic_number, @address, @postal_code,
            @is_public, 1, @pdf_raw_schedule)
  `);
  const insertDay = db.prepare(`
    INSERT OR IGNORE INTO open_days (school_id, date, raw_text, source)
    VALUES (?, ?, ?, 'pdf')
  `);
  const PRIVATE_IN_PDF = new Set([
    "Publiczne Salezjańskie Liceum Ogólnokształcące",
    "Publiczne LO im. Królowej Apostołów - Pallotyńskie",
    "LO św.Rity",
  ]);

  db.transaction(() => {
    for (const r of rows) {
      const s = seed[r.schoolId];
      if (!s) throw new Error(`No seed entry for "${r.schoolId}"`);
      insertSchool.run({
        id: r.schoolId,
        full_name: s.fullName,
        arabic_number: romanValue(r.schoolId),
        address: s.address,
        postal_code: s.postalCode,
        is_public: PRIVATE_IN_PDF.has(r.schoolId) ? 0 : 1,
        pdf_raw_schedule: r.rawDateText,
      });
      for (const iso of extractDates(r.rawDateText)) {
        insertDay.run(r.schoolId, iso, r.rawDateText);
      }
    }
  })();

  console.log(`           seeded ${rows.length} schools`);
}

// ---------- Phase 2: otouczelnie index merge ------------------------

async function phaseOtouczelnieIndex(db: Db): Promise<Map<string, IndexEntry>> {
  console.log("[phase 2] otouczelnie index");
  const all = await scrapeIndex();
  const youth = all.filter((e) => !e.isAdult);
  console.log(`           ${all.length} total, ${youth.length} for youth`);

  const existing = db.prepare(`SELECT id, address FROM schools`).all() as Array<{
    id: string;
    address: string;
  }>;
  const findByAddress = (street: string): string | undefined =>
    existing.find((x) => addressesMatch(x.address, street))?.id;

  const updateExisting = db.prepare(`
    UPDATE schools SET
      district = COALESCE(schools.district, @district),
      is_public = @is_public,
      otouczelnie_id = @otouczelnie_id,
      otouczelnie_url = @otouczelnie_url
    WHERE id = @id
  `);
  const insertNew = db.prepare(`
    INSERT INTO schools (id, full_name, arabic_number, address, postal_code,
                         district, is_public, in_pdf,
                         otouczelnie_id, otouczelnie_url)
    VALUES (@id, @full_name, @arabic_number, @address, '',
            @district, @is_public, 0,
            @otouczelnie_id, @otouczelnie_url)
  `);

  // Per-entry id for downstream phases (detail / thresholds).
  const idForOtouczelnieId = new Map<string, IndexEntry>();

  let matched = 0;
  let inserted = 0;
  db.transaction(() => {
    for (const e of youth) {
      const existingId = findByAddress(e.street);
      if (existingId) {
        updateExisting.run({
          id: existingId,
          district: e.district,
          is_public: e.isPublic ? 1 : 0,
          otouczelnie_id: e.otouczelnieId,
          otouczelnie_url: e.url,
        });
        idForOtouczelnieId.set(existingId, e);
        matched++;
        continue;
      }
      // No address match. Fall back to name equality against an existing
      // school before giving up — this catches a handful of private schools
      // whose otouczelnie address strings differ cosmetically from the
      // hand-verified PDF seed, but whose full names agree.
      const byName = db
        .prepare(`SELECT id FROM schools WHERE lower(full_name) = lower(?) OR lower(id) = lower(?)`)
        .get(e.name, e.name) as { id: string } | undefined;
      if (byName) {
        updateExisting.run({
          id: byName.id,
          district: e.district,
          is_public: e.isPublic ? 1 : 0,
          otouczelnie_id: e.otouczelnieId,
          otouczelnie_url: e.url,
        });
        idForOtouczelnieId.set(byName.id, e);
        matched++;
        continue;
      }
      const newId = e.name;
      insertNew.run({
        id: newId,
        full_name: e.name,
        arabic_number: romanValue(e.name),
        address: e.street,
        district: e.district,
        is_public: e.isPublic ? 1 : 0,
        otouczelnie_id: e.otouczelnieId,
        otouczelnie_url: e.url,
      });
      idForOtouczelnieId.set(newId, e);
      inserted++;
    }
  })();
  console.log(`           matched ${matched} to existing PDF schools, inserted ${inserted} new`);
  return idForOtouczelnieId;
}

// ---------- Phase 1b: geocode missing coords ------------------------

async function phaseGeocodeSchools(db: Db) {
  console.log("[phase 1b] Geocoding schools missing coordinates");
  const missing = db.prepare(
    `SELECT id, address, postal_code, full_name FROM schools WHERE lat IS NULL OR lon IS NULL`,
  ).all() as Array<{ id: string; address: string; postal_code: string; full_name: string }>;

  if (missing.length === 0) {
    console.log("           nothing to geocode");
    return;
  }
  console.log(`           ${missing.length} to geocode`);

  const inputs = missing.map((m) => {
    const stripped = m.address.replace(/^(ul\.|al\.|pl\.|os\.)\s*/i, "");
    // Strip honorifics (Ks., Fr., św.) and apartment suffixes (lok.5) —
    // Nominatim chokes on both.
    const simplified = m.address
      .replace(/\bks\.|\bfr\.|\bśw\./gi, "")
      .replace(/\s+lok\.?\s*\d+.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const withPost = m.postal_code
      ? [`${m.address}, ${m.postal_code} Kraków, Polska`]
      : [];
    return {
      key: m.id,
      queries: [
        ...withPost,
        `${m.address}, Kraków, Polska`,
        `${stripped}, Kraków, Polska`,
        `${simplified}, Kraków, Polska`,
        `${m.full_name}, Kraków, Polska`,
      ].filter((q, i, arr) => arr.indexOf(q) === i),
    };
  });

  const results = await geocodeAll(inputs);
  const update = db.prepare(`UPDATE schools SET lat = ?, lon = ? WHERE id = ?`);
  for (const [id, g] of results) {
    if (g) update.run(g.lat, g.lon, id);
    else console.warn(`           ! no geo for "${id}"`);
  }
}

// ---------- Phase 1c: landmarks ------------------------------------

async function phaseLandmarks(db: Db) {
  console.log("[phase 1c] Landmarks");
  const seed = await readJson<Array<{ id: string; address: string }>>(
    resolve(__dirname, "landmarks-seed.json"),
  );
  const results = await geocodeAll(
    seed.map((l) => {
      const stripped = l.address.replace(/^(ul\.|al\.|pl\.|os\.)\s*/i, "");
      return {
        key: l.id,
        queries: [`${l.address}, Kraków, Polska`, `${stripped}, Kraków, Polska`],
      };
    }),
  );
  const insert = db.prepare(
    `INSERT INTO landmarks (id, address, lat, lon) VALUES (?, ?, ?, ?)`,
  );
  for (const l of seed) {
    const g = results.get(l.id);
    if (!g) throw new Error(`Could not geocode landmark "${l.id}"`);
    insert.run(l.id, l.address, g.lat, g.lon);
  }
  console.log(`           wrote ${seed.length} landmarks`);
}

// ---------- Phase 3: per-school class profiles ---------------------

async function phaseScrapeClasses(db: Db, entries: Map<string, IndexEntry>) {
  console.log("[phase 3] Scraping class profiles");
  const updateWebsite = db.prepare(
    `UPDATE schools SET website = COALESCE(website, ?) WHERE id = ?`,
  );
  const insertClass = db.prepare(`
    INSERT OR REPLACE INTO classes
      (school_id, year, code, profile,
       extended_subjects, recruitment_subjects, languages)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let scraped = 0;
  let classCount = 0;
  for (const [schoolId, entry] of entries) {
    const d = await scrapeDetail(entry);
    if (d.website) updateWebsite.run(d.website, schoolId);
    const year = d.year ?? "2026/2027";
    db.transaction(() => {
      for (const c of d.classes) {
        insertClass.run(
          schoolId,
          year,
          c.code,
          c.profile,
          JSON.stringify(c.extendedSubjects),
          JSON.stringify(c.recruitmentSubjects),
          JSON.stringify(c.languages),
        );
      }
    })();
    classCount += d.classes.length;
    scraped++;
  }
  console.log(`           ${scraped} schools scraped, ${classCount} classes recorded`);
}

// ---------- Phase 4: thresholds ------------------------------------

async function phaseScrapeThresholds(db: Db, entries: Map<string, IndexEntry>) {
  console.log("[phase 4] Scraping thresholds");
  const insertT = db.prepare(`
    INSERT OR REPLACE INTO thresholds (school_id, year, class_code, points_min, source_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  let schoolsWithData = 0;
  let totalRows = 0;
  for (const [schoolId, entry] of entries) {
    try {
      const t = await scrapeThresholds(entry);
      if (!t.rows.length) continue;
      const year = t.year ?? "unknown";
      db.transaction(() => {
        for (const r of t.rows) {
          insertT.run(schoolId, year, r.classCode, r.pointsMin, t.sourceUrl);
        }
      })();
      totalRows += t.rows.length;
      schoolsWithData++;
    } catch (err) {
      // e.g. 404 when a school has no threshold subpage.
      console.warn(`           ! thresholds failed for ${schoolId}: ${(err as Error).message}`);
    }
  }
  console.log(`           ${schoolsWithData} schools with threshold data, ${totalRows} rows`);
}

// ---------- Export: DB → JSON the frontend reads -------------------

type FrontendClass = {
  code: string;
  profile: string | null;
  extendedSubjects: string[];
  recruitmentSubjects: string[];
  languages: string[];
  thresholdMin: number | null;
  thresholdYear: string | null;
};

type FrontendSchool = {
  id: string;
  fullName: string;
  address: string;
  postalCode: string;
  district: string | null;
  lat: number;
  lon: number;
  openDays: string[];
  rawSchedule: string;
  isPublic: boolean;
  inPdf: boolean;
  website: string | null;
  otouczelnieUrl: string | null;
  classesYear: string | null;
  classes: FrontendClass[];
};

async function exportJsonForFrontend(db: Db) {
  console.log("[export] Writing src/data/*.json");
  const outDir = resolve(ROOT, "src", "data");
  await mkdir(outDir, { recursive: true });

  type SchoolRow = {
    id: string;
    full_name: string;
    address: string;
    postal_code: string | null;
    district: string | null;
    lat: number | null;
    lon: number | null;
    pdf_raw_schedule: string | null;
    is_public: number;
    in_pdf: number;
    website: string | null;
    otouczelnie_url: string | null;
  };

  const rows = db
    .prepare(
      `SELECT id, full_name, address, postal_code, district, lat, lon,
              pdf_raw_schedule, is_public, in_pdf, website, otouczelnie_url
         FROM schools`,
    )
    .all() as SchoolRow[];

  const daysStmt = db.prepare(
    `SELECT date FROM open_days WHERE school_id = ? ORDER BY date ASC`,
  );
  const classesStmt = db.prepare(`
    SELECT c.code, c.profile, c.extended_subjects, c.recruitment_subjects,
           c.languages, c.year,
           t.points_min, t.year AS threshold_year
      FROM classes c
      LEFT JOIN thresholds t
        ON t.school_id = c.school_id AND t.class_code = c.code
     WHERE c.school_id = ?
  `);

  const schools: FrontendSchool[] = rows
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => {
      const classRows = classesStmt.all(r.id) as Array<{
        code: string;
        profile: string | null;
        extended_subjects: string;
        recruitment_subjects: string;
        languages: string;
        year: string;
        points_min: number | null;
        threshold_year: string | null;
      }>;
      const classes: FrontendClass[] = classRows.map((c) => ({
        code: c.code,
        profile: c.profile,
        extendedSubjects: JSON.parse(c.extended_subjects || "[]"),
        recruitmentSubjects: JSON.parse(c.recruitment_subjects || "[]"),
        languages: JSON.parse(c.languages || "[]"),
        thresholdMin: c.points_min,
        thresholdYear: c.threshold_year,
      }));
      return {
        id: r.id,
        fullName: r.full_name,
        address: r.address,
        postalCode: r.postal_code ?? "",
        district: r.district,
        lat: r.lat!,
        lon: r.lon!,
        openDays: (daysStmt.all(r.id) as Array<{ date: string }>).map((d) => d.date),
        rawSchedule: r.pdf_raw_schedule ?? "",
        isPublic: r.is_public === 1,
        inPdf: r.in_pdf === 1,
        website: r.website,
        otouczelnieUrl: r.otouczelnie_url,
        classesYear: classRows[0]?.year ?? null,
        classes,
      };
    });

  schools.sort((a, b) => {
    const na = romanValue(a.id);
    const nb = romanValue(b.id);
    if (na == null && nb == null) return a.id.localeCompare(b.id);
    if (na == null) return 1;
    if (nb == null) return -1;
    return na - nb;
  });

  await writeFile(
    resolve(outDir, "schools.json"),
    JSON.stringify(schools, null, 2) + "\n",
  );

  const landmarks = db
    .prepare(`SELECT id, address, lat, lon FROM landmarks ORDER BY id`)
    .all();
  await writeFile(
    resolve(outDir, "landmarks.json"),
    JSON.stringify(landmarks, null, 2) + "\n",
  );

  console.log(`         ${schools.length} schools, ${landmarks.length} landmarks`);
}

// ---------- Orchestrator -------------------------------------------

async function main() {
  const db = openDb();
  runMigrations(db);
  resetDataTables(db);
  try {
    await phaseSeedFromPdf(db);
    const otouEntries = await phaseOtouczelnieIndex(db);
    await phaseGeocodeSchools(db);
    await phaseLandmarks(db);
    await phaseScrapeClasses(db, otouEntries);
    await phaseScrapeThresholds(db, otouEntries);
    await exportJsonForFrontend(db);
    console.log("\n✓ Done");
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

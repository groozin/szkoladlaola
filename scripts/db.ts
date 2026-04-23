/**
 * SQLite is the build-time knowledge base. The frontend never touches it —
 * it reads the JSON files emitted by `exportJsonForFrontend()` at the end
 * of `build-data`.
 *
 * We rebuild the DB from scratch every run (`resetDataTables`). Sources are
 * either files under the repo (the PDF, the addresses seed) or HTTP caches
 * under .cache/otouczelnie/, so a rebuild is deterministic and offline
 * once the caches have been populated.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
export const DB_PATH = resolve(ROOT, "data", "schools.db");

export type Db = ReturnType<typeof openDb>;

export function openDb(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** Idempotent: safe on a fresh DB or an existing one. */
export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id                TEXT PRIMARY KEY,
      full_name         TEXT NOT NULL,
      arabic_number     INTEGER,
      address           TEXT NOT NULL,
      postal_code       TEXT,
      district          TEXT,
      lat               REAL,
      lon               REAL,
      website           TEXT,
      is_public         INTEGER NOT NULL DEFAULT 1,
      in_pdf            INTEGER NOT NULL DEFAULT 0,
      otouczelnie_id    INTEGER UNIQUE,
      otouczelnie_url   TEXT,
      pdf_raw_schedule  TEXT,             -- original Polish free-text from PDF cell
      rank_malopolska   INTEGER,          -- Perspektywy 2025 wojewódzki rank (Małopolska)
      rank_poland       INTEGER,          -- Perspektywy 2025 national rank
      notes             TEXT
    );

    CREATE TABLE IF NOT EXISTS open_days (
      school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      raw_text    TEXT,
      source      TEXT NOT NULL,          -- 'pdf' | 'homepage' | 'otouczelnie'
      PRIMARY KEY (school_id, date)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id            TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      year                 TEXT NOT NULL,
      code                 TEXT NOT NULL,
      profile              TEXT,
      extended_subjects    TEXT,           -- JSON array
      recruitment_subjects TEXT,           -- JSON array
      languages            TEXT,           -- JSON array
      notes                TEXT,
      UNIQUE (school_id, year, code)
    );

    CREATE TABLE IF NOT EXISTS thresholds (
      school_id   TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      year        TEXT NOT NULL,
      class_code  TEXT NOT NULL,
      points_min  REAL,
      source_url  TEXT,
      PRIMARY KEY (school_id, year, class_code)
    );

    CREATE TABLE IF NOT EXISTS sources (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id   TEXT REFERENCES schools(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      url         TEXT,
      fetched_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS landmarks (
      id       TEXT PRIMARY KEY,
      address  TEXT NOT NULL,
      lat      REAL NOT NULL,
      lon      REAL NOT NULL
    );
  `);
}

/** Clear domain data but preserve the schema (used at the top of each run). */
export function resetDataTables(db: Database.Database) {
  db.exec(`
    DELETE FROM thresholds;
    DELETE FROM classes;
    DELETE FROM open_days;
    DELETE FROM sources;
    DELETE FROM landmarks;
    DELETE FROM schools;
  `);
}

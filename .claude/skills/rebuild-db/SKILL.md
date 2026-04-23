---
name: rebuild-db
description: Rebuild the Szkoła-dla-Ola knowledge base. Re-runs the full offline data pipeline — PDF + otouczelnie scraper + Perspektywy API → SQLite → frontend JSON. Use when open-days.pdf, addresses-seed.json, or landmarks-seed.json changes, or when the user wants fresh scraped data. Also use when a scraper or schema change has landed and you need to re-materialise data/schools.db + src/data/*.json.
---

# rebuild-db — rebuild the knowledge base

The project ships a CLI at `npm run build-data` that runs the full pipeline
end-to-end. It always rebuilds `data/schools.db` from scratch, so there's no
incremental mode to reason about. HTTP responses are cached under `.cache/`
so reruns are free.

## Standard run

```bash
npm run build-data
```

Expected final lines:

```
[phase 5] Perspektywy 2025 ranking (Małopolska)
           51 Kraków schools ranked
           matched 42, unmatched ≤ 10
[export] Writing src/data/*.json
         82 schools, 2 landmarks

✓ Done
```

Sanity-check the output before declaring success:

| Signal                                | Expected                              |
|---------------------------------------|---------------------------------------|
| PDF schools seeded                    | 35                                    |
| Otouczelnie youth schools merged      | ~84 (≥ 80)                            |
| Missing coords                        | ≤ 2 (two known edge-case addresses)   |
| Classes rows                          | ~210 (≥ 200)                          |
| Schools with threshold data           | ~34                                   |
| Kraków schools matched to Perspektywy | ~42 / 51                              |
| Final JSON school count               | 82                                    |
| Final JSON landmark count             | 2                                     |

If any of these diverge noticeably, do not claim success — inspect the phase
that changed.

## Force a fresh fetch of one source

Delete only the cache you want to invalidate, then re-run:

```bash
rm -rf .cache/otouczelnie/          # re-scrape otouczelnie (slow — ~4 min)
rm -rf .cache/perspektywy/          # re-fetch Perspektywy (fast — 2 requests)
rm -f  .cache/geocode.json          # re-geocode any school (rate-limited to 1 req/s)
```

`.cache/otouczelnie/index.html` vs `.cache/otouczelnie/school/<id>/...` lets
you target the index or a single school.

## Quick DB inspection

```bash
sqlite3 data/schools.db 'SELECT COUNT(*) FROM schools;'
sqlite3 data/schools.db \
  "SELECT rank_malopolska, id FROM schools WHERE rank_malopolska IS NOT NULL ORDER BY rank_malopolska LIMIT 10;"
sqlite3 data/schools.db \
  "SELECT school_id, COUNT(*) FROM classes GROUP BY school_id ORDER BY COUNT(*) DESC LIMIT 5;"
```

## If the schema changed

When new columns are added to the SQLite schema, you must also update:

1. `scripts/db.ts` — `runMigrations()` (column on the `CREATE TABLE`).
2. `scripts/build-data.ts` — the phase that populates the column, plus the
   `SchoolRow` type and the `SELECT` in `exportJsonForFrontend()`.
3. `src/types.ts` — the frontend `School` type.
4. Whichever component(s) render the new field.

Always blow away `data/schools.db*` before re-running if migrations changed —
the schema is idempotent (`CREATE TABLE IF NOT EXISTS`), so columns won't
appear on an existing table.

```bash
rm -f data/schools.db*
npm run build-data
```

## Frontend verification

After `build-data`, confirm the app still type-checks and builds:

```bash
npm run build
```

No need to run the dev server for a plain data refresh — the frontend only
reads the two JSON files.

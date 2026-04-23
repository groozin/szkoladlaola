# Szkoła dla Ola 2026

Web app that helps choose a Kraków high school ("liceum"). Polish UI throughout,
the data pipeline runs offline in Node, and the frontend is a static Vite +
React build that reads pre-computed JSON.

## Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind + MapLibre GL (OSM
  raster tiles — no API keys).
- **Data pipeline** (Node, `scripts/`): `better-sqlite3` + `cheerio`, polite
  cached HTTP fetches under `.cache/`.
- **Knowledge base**: `data/schools.db` (SQLite, gitignored) is the source of
  truth during a build; the final step denormalises it into
  `src/data/schools.json` + `src/data/landmarks.json`, which is what the
  frontend actually consumes. No WASM / sql.js in the browser.

## Commands

| Script             | What it does                                                    |
|--------------------|-----------------------------------------------------------------|
| `npm run dev`      | Vite dev server (hot reload)                                    |
| `npm run build`    | `tsc -b && vite build` — type-check + production bundle         |
| `npm run build-data` | End-to-end data pipeline: PDF + scrapers → SQLite → JSON      |

## Data flow (what `build-data` does)

1. **PDF seed** — parses `open-days.pdf` + `scripts/addresses-seed.json`
   (hand-verified Kraków addresses); inserts 35 schools + open_days.
2. **Otouczelnie index** — scrapes
   `https://www.otouczelnie.pl/artykul/208/Licea-publiczne-i-prywatne-w-Krakowie-wyszukiwarka`,
   filters to youth licea (excludes "dla dorosłych"), merges with existing
   PDF schools by address-or-name, inserts the rest (~50 more) with
   `in_pdf = 0`.
3. **Geocode** — fills any `lat`/`lon IS NULL` school via Nominatim (OSM).
   Caches hits + misses in `.cache/geocode.json`; strips `ul./al./pl./os.`
   prefixes in fallback queries.
4. **Landmarks** — geocodes `scripts/landmarks-seed.json` (Mama, Tata — blue
   reference pills on the map).
5. **Classes** — per school with an `otouczelnie_id`, scrapes the main page
   for class profiles (`Klasa 1A (biol-chem-mat)` + extended subjects +
   recruitment subjects + languages) for the 2026/27 recruitment year.
6. **Thresholds** — per school, appends `/progi-punktowe` and parses the
   threshold table (2025/26 is the most recent year with data populated).
7. **Perspektywy ranking** — hits `api.perspektywy.pl/v1/ranking/edition/ranking-liceow-2025`
   then the per-ranking endpoint, filters to Kraków rows, fuzzy-matches each
   row to a school id (expanding `LO ↔ Liceum Ogólnokształcące`, dropping the
   `w Krakowie` suffix, sorting longest-id first), writes `rank_malopolska`
   and `rank_poland`.
8. **Export** — denormalises the DB into the JSON files the frontend reads.

All HTTP is cached under `.cache/` so reruns are network-free. The DB is
always dropped and rebuilt from sources at the start of each run — there is
no incremental mode.

## Sources

| Source                         | What we extract                               |
|--------------------------------|-----------------------------------------------|
| `open-days.pdf`                | Open-day dates, raw schedule text             |
| `scripts/addresses-seed.json`  | Hand-verified addresses (canonical)           |
| `scripts/landmarks-seed.json`  | Mama / Tata reference points                  |
| otouczelnie.pl                 | Schools list, class profiles, thresholds      |
| api.perspektywy.pl             | 2025 regional + national ranking              |

## Key files

```
scripts/
  build-data.ts          Orchestrator: all phases, JSON export
  db.ts                  SQLite schema + openDb / runMigrations / reset
  parse-pdf.ts           pdfjs-dist → row clustering with multi-line label handling
  extract-dates.ts       Polish date regex: "22.05.2026", ranges, 2-digit years
  geocode.ts             Nominatim with persistent cache, 1 req/sec
  http-cache.ts          Polite cached HTTP GET (used by all web scrapers)
  scrape-otouczelnie.ts  cheerio selectors for the index + detail + /progi-punktowe
  scrape-perspektywy.ts  JSON API fetch + normName + fuzzy matchSchool

src/
  App.tsx                Root; selectedId/expandedId state, filter + sort + view wiring
  data/schools.json      Written by build-data; 82 schools
  data/landmarks.json    Written by build-data; 2 landmarks
  components/
    SchoolList.tsx       Left-hand list of school cards
    MapView.tsx          MapLibre canvas + custom pill markers + popups
    CalendarView.tsx     Full-width month grid, unfiltered
    FilterBar.tsx        Collapsible filter panel (scope, subjects, languages, threshold)
    SortBar.tsx          Thin strip above the list (upcoming / ranking / threshold, asc/desc)
    CalendarPlusIcon.tsx Inline Lucide-style "calendar+plus" SVG
  utils/
    dates.ts             todayISO, nextUpcoming, formatDate, humanCountdown
    roman.ts             Roman↔Arabic, displayId ("XVIII (18) LO"), markerLabel
    schedule.ts          Per-date slice of the raw PDF schedule
    filters.ts           Filters type, URL sync, facet extraction, sort/view types
    classes.ts           Polish "klasa" pluralisation, thresholdRange
    calendar-export.ts   Google Calendar URL + ICS file builder + download
```

## UI / data conventions

- **Language**: UI is Polish; all data strings stay in Polish. Use `pl-PL`
  locale for date formatting.
- **School ids**: `"V LO"`, `"XVIII LO"`, or the full name for private schools
  (`"LO św.Rity"`). Used as DB primary key and frontend `School.id`.
- **Roman → Arabic**: `displayId()` renders `"XVIII (18) LO"` in lists,
  popups, and calendar chips. Only applies when the id matches `^[IVXLCDM]+ LO`;
  private/named schools are unchanged.
- **Filter state** lives in one `Filters` object and is mirrored to the URL
  via `replaceState` (no history pollution). Sort is technically part of
  Filters for URL purposes but is rendered in its own SortBar outside the
  filter panel.
- **Colour code**: green = upcoming open day, red = all past, amber = no
  open-day info. Private schools get a purple ring/badge. Rank pill is
  yellow, threshold pill is amber.

## Known gotchas

- **MapLibre marker transforms** — MapLibre sets an inline `transform:
  translate(...)` on each marker's root element to position it. Never put a
  CSS `transform` on `.school-marker-root`; always style the child
  `.school-marker-pill` instead. This is why the pill is a two-element
  structure.
- **Event bubbling for popups** — `marker.setPopup()` wires the click handler
  to the root element, not the inner pill. Don't call `stopPropagation()` on
  the pill's click handler or the popup will never open.
- **Address normalisation** — `ul./al./pl./os.` require the trailing dot in
  the regex; full words (`plac`, `osiedle`) need a trailing space. Otherwise
  `"os"` greedily eats the `"os"` from `"osiedle"` and the full form never
  normalises. See `normalizeAddress` in `build-data.ts`.
- **Otouczelnie "grupa" suffix** — schools that split a class into language
  groups have headings like `"Klasa 1A grupa 1 (psychologiczno-pedagogiczna)"`.
  The class-heading regex must accept an optional `" grupa N"` between the
  code and the parenthesised profile, and that suffix has to be included in
  the stored `code` so `UNIQUE (school_id, year, code)` keeps all groups.
- **PDF date parsing quirks** — pdfjs-dist sometimes splits digits with
  stray spaces (e.g. `"1 8 .0 4 .2026"` for XIV LO). `extract-dates.ts`
  runs the regex on both the original and a whitespace-collapsed version
  and unions the results. Preprocessing alone would break other rows like
  `"25.04.2026 10:00"` where `"2026 10"` would glue into `"202610"`.
- **Private schools in the PDF have short ids** (`"LO św.Rity"`) that
  coincidentally equal otouczelnie full names. When merging, match by
  normalised address first, then fall back to name equality, to avoid a
  duplicate-key INSERT.
- **Perspektywy matching** — their API names use the short `LO` form
  (`"V LO im. Augusta Witkowskiego"`) while otouczelnie names use
  `"V Liceum Ogólnokształcące im. Augusta Witkowskiego w Krakowie"`.
  `normName` expands `Liceum Ogólnokształcące ↔ lo` and drops `w Krakowie`.
- **ICS file format** — RFC 5545 requires `\r\n` line endings and escaping
  of `\ , ; \n` inside field values. Events are all-day (`DTSTART;VALUE=DATE`)
  because the PDF often gives only a date.

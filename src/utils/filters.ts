import type { School, SchoolClass } from "../types";

export type Scope = "pdf" | "all";
export type View = "list" | "map" | "calendar";
export type CalMode = "month" | "week" | "agenda";
export type SortMode = "upcoming" | "rank" | "threshold";
export type SortDir = "asc" | "desc";

/** The direction that makes intuitive sense when switching *to* a given mode. */
export const DEFAULT_SORT_DIR: Record<SortMode, SortDir> = {
  upcoming: "asc",     // earliest open day first
  rank: "asc",         // #1 first
  threshold: "desc",   // highest próg first (best schools)
};

export function viewFromUrl(): View {
  if (typeof window === "undefined") return "map";
  const v = new URLSearchParams(window.location.search).get("view");
  if (v === "calendar" || v === "list") return v;
  return "map";
}

export function writeViewToUrl(view: View): void {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  if (view === "map") p.delete("view");
  else p.set("view", view);
  const qs = p.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url + window.location.hash);
}

export function calModeFromUrl(): CalMode {
  if (typeof window === "undefined") return "month";
  const v = new URLSearchParams(window.location.search).get("cal");
  if (v === "week" || v === "agenda") return v;
  return "month";
}

export function writeCalModeToUrl(mode: CalMode): void {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  if (mode === "month") p.delete("cal");
  else p.set("cal", mode);
  const qs = p.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url + window.location.hash);
}

export type Filters = {
  scope: Scope;                     // "pdf" = only schools from the PDF; "all" = everything
  hidePast: boolean;                // hide schools whose open days have all passed
  includePrivate: boolean;          // off by default — private schools hidden unless on
  sort: SortMode;                   // ordering of the visible list
  sortDir: SortDir;
  /** Show only classes whose threshold >= this. Classes with no threshold
   *  data are hidden whenever this is non-null. */
  thresholdMin: number | null;
  /** AND semantics: class must offer every selected subject. */
  subjects: string[];
  /** AND semantics: class must offer every selected language. */
  languages: string[];
};

export const DEFAULT_FILTERS: Filters = {
  scope: "pdf",
  hidePast: false,
  includePrivate: false,
  sort: "upcoming",
  sortDir: "asc",
  thresholdMin: null,
  subjects: [],
  languages: [],
};

/** Sort is no longer counted as a "filter" for badges/clear-all purposes. */
function isNonDefault(f: Filters): Array<keyof Filters> {
  const out: Array<keyof Filters> = [];
  if (f.scope !== DEFAULT_FILTERS.scope) out.push("scope");
  if (f.hidePast) out.push("hidePast");
  if (f.includePrivate) out.push("includePrivate");
  if (f.thresholdMin != null) out.push("thresholdMin");
  if (f.subjects.length > 0) out.push("subjects");
  if (f.languages.length > 0) out.push("languages");
  return out;
}

export function hasAnyFilter(f: Filters): boolean {
  return isNonDefault(f).length > 0;
}

export function activeFilterCount(f: Filters): number {
  return isNonDefault(f).length;
}

/** True when a *class-level* filter (threshold / subjects / languages) is set.
 *  Use this — not hasAnyFilter — before narrowing a school's classes list,
 *  otherwise toggling school-level filters (scope, includePrivate, hidePast)
 *  would unexpectedly drop schools whose classes list is empty. */
export function hasClassFilter(f: Filters): boolean {
  return f.thresholdMin != null || f.subjects.length > 0 || f.languages.length > 0;
}

export function classPasses(c: SchoolClass, f: Filters): boolean {
  if (f.thresholdMin != null) {
    if (c.thresholdMin == null || c.thresholdMin < f.thresholdMin) return false;
  }
  // AND semantics: class must offer every selected subject / language.
  if (f.subjects.length > 0) {
    if (c.extendedSubjects.length === 0) return false;
    if (!f.subjects.every((s) => c.extendedSubjects.includes(s))) return false;
  }
  if (f.languages.length > 0) {
    if (c.languages.length === 0) return false;
    if (!f.languages.every((l) => c.languages.includes(l))) return false;
  }
  return true;
}

/** Returns the school with its classes filtered, or null if nothing remains. */
export function applyFiltersToSchool(s: School, f: Filters): School | null {
  if (!hasClassFilter(f)) return s;
  const classes = s.classes.filter((c) => classPasses(c, f));
  if (classes.length === 0) return null;
  return { ...s, classes };
}

// ---------- URL sync ----------------------------------------------

/** Read filters from the current URL. Safe on first paint. */
export function filtersFromUrl(): Filters {
  if (typeof window === "undefined") return { ...DEFAULT_FILTERS };
  const p = new URLSearchParams(window.location.search);
  const threshold = p.get("threshold");
  const num = threshold != null ? Number(threshold) : NaN;
  const rawSort = p.get("sort");
  const rawDir = p.get("sortDir");
  const sort: SortMode =
    rawSort === "rank" || rawSort === "threshold" ? rawSort : "upcoming";
  return {
    scope: p.get("scope") === "all" ? "all" : "pdf",
    hidePast: p.get("hidePast") === "1",
    includePrivate: p.get("private") === "1",
    sort,
    sortDir: rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_SORT_DIR[sort],
    thresholdMin: Number.isFinite(num) && num > 0 ? num : null,
    subjects: p.get("subjects")?.split(",").filter(Boolean) ?? [],
    languages: p.get("languages")?.split(",").filter(Boolean) ?? [],
  };
}

/** Mirror filters into the URL. Uses replaceState so we don't pollute history. */
export function writeFiltersToUrl(f: Filters): void {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams();
  if (f.scope !== DEFAULT_FILTERS.scope) p.set("scope", f.scope);
  if (f.hidePast) p.set("hidePast", "1");
  if (f.includePrivate) p.set("private", "1");
  if (f.sort !== DEFAULT_FILTERS.sort) p.set("sort", f.sort);
  if (f.sortDir !== DEFAULT_SORT_DIR[f.sort]) p.set("sortDir", f.sortDir);
  if (f.thresholdMin != null) p.set("threshold", String(f.thresholdMin));
  if (f.subjects.length) p.set("subjects", f.subjects.join(","));
  if (f.languages.length) p.set("languages", f.languages.join(","));
  const qs = p.toString();
  const url = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.replaceState(null, "", url + window.location.hash);
}

// ---------- facet extraction --------------------------------------

export type FacetValue = { value: string; count: number };

/** Collect unique extended subjects / languages across all schools, with
 *  the number of classes offering each — sorted by descending count so the
 *  most common options surface first. */
export function buildFacets(schools: School[]): {
  subjects: FacetValue[];
  languages: FacetValue[];
} {
  const subjCounts = new Map<string, number>();
  const langCounts = new Map<string, number>();
  for (const s of schools) {
    for (const c of s.classes) {
      for (const v of c.extendedSubjects) subjCounts.set(v, (subjCounts.get(v) ?? 0) + 1);
      for (const v of c.languages) langCounts.set(v, (langCounts.get(v) ?? 0) + 1);
    }
  }
  const toFacet = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return { subjects: toFacet(subjCounts), languages: toFacet(langCounts) };
}

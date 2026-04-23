import { useEffect, useMemo, useRef, useState } from "react";
import schoolsJson from "./data/schools.json";
import landmarksJson from "./data/landmarks.json";
import type { Landmark, School } from "./types";
import { SchoolList, type SchoolListHandle } from "./components/SchoolList";
import { MapView } from "./components/MapView";
import { CalendarView } from "./components/CalendarView";
import { FilterBar } from "./components/FilterBar";
import { SortBar } from "./components/SortBar";
import { nextUpcoming, todayISO, formatDate } from "./utils/dates";
import {
  applyFiltersToSchool,
  buildFacets,
  filtersFromUrl,
  viewFromUrl,
  writeFiltersToUrl,
  writeViewToUrl,
  type Filters,
  type View,
} from "./utils/filters";

const schools = schoolsJson as School[];
const landmarks = landmarksJson as Landmark[];
const facets = buildFacets(schools);
const pdfCount = schools.filter((s) => s.inPdf).length;

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => filtersFromUrl());
  const [view, setView] = useState<View>(() => viewFromUrl());
  const listRef = useRef<SchoolListHandle>(null);

  useEffect(() => {
    writeFiltersToUrl(filters);
  }, [filters]);
  useEffect(() => {
    writeViewToUrl(view);
  }, [view]);

  const today = todayISO();
  const visibleSchools = useMemo(() => {
    const step1 = filters.scope === "pdf" ? schools.filter((s) => s.inPdf) : schools;
    const step2 = filters.includePrivate ? step1 : step1.filter((s) => s.isPublic);
    const step3 = filters.hidePast
      ? step2.filter((s) => nextUpcoming(s.openDays, today) !== null)
      : step2;
    const step4 = step3
      .map((s) => applyFiltersToSchool(s, filters))
      .filter((s): s is School => s != null);

    // Schools without the relevant data always sort to the bottom; ties fall
    // back to id for a stable order.
    const minThreshold = (s: School): number | null => {
      const vals = s.classes
        .map((c) => c.thresholdMin)
        .filter((v): v is number => v != null);
      return vals.length ? Math.min(...vals) : null;
    };
    const nullsLast = <T,>(
      a: T | null,
      b: T | null,
      cmp: (x: T, y: T) => number,
    ): number => {
      if (a != null && b != null) return cmp(a, b);
      if (a != null) return -1;
      if (b != null) return 1;
      return 0;
    };
    const hasSortKey = (s: School, mode: typeof filters.sort, t: string): boolean => {
      if (mode === "rank") return s.rankMalopolska != null;
      if (mode === "threshold") return minThreshold(s) != null;
      return nextUpcoming(s.openDays, t) != null;
    };

    const sign = filters.sortDir === "desc" ? -1 : 1;
    step4.sort((a, b) => {
      let primary = 0;
      if (filters.sort === "rank") {
        primary = nullsLast(a.rankMalopolska, b.rankMalopolska, (x, y) => x - y);
      } else if (filters.sort === "threshold") {
        primary = nullsLast(minThreshold(a), minThreshold(b), (x, y) => x - y);
      } else {
        primary = nullsLast(
          nextUpcoming(a.openDays, today),
          nextUpcoming(b.openDays, today),
          (x, y) => x.localeCompare(y),
        );
      }
      // Only flip direction when both sides have data — keep the "no data goes
      // to the bottom" invariant regardless of asc/desc.
      if (primary !== 0 && a.id && b.id) {
        const aHas = hasSortKey(a, filters.sort, today);
        const bHas = hasSortKey(b, filters.sort, today);
        if (aHas && bHas) primary *= sign;
      }
      return primary !== 0 ? primary : a.id.localeCompare(b.id);
    });
    return step4;
  }, [today, filters]);

  /** Select + auto-expand the school's card. */
  const selectSchool = (id: string) => {
    setSelectedId(id);
    setExpandedId(id);
  };

  const handleSelectFromList = (id: string) => {
    selectSchool(id);
    listRef.current?.scrollTo(id);
  };

  /** From calendar: jump to map with this school selected. */
  const handleSelectFromCalendar = (id: string) => {
    selectSchool(id);
    setView("map");
  };

  const collapseCard = () => setExpandedId(null);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-900">
          Szkoła dla Ola 2026
        </h1>
        <p className="text-xs text-slate-500">stan na {formatDate(today)}</p>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-sm">
        <TabButton active={view === "map"} onClick={() => setView("map")}>
          Mapa
        </TabButton>
        <TabButton active={view === "calendar"} onClick={() => setView("calendar")}>
          Kalendarz dni otwartych
        </TabButton>
      </nav>

      {view === "map" ? (
        <>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            subjectFacets={facets.subjects}
            languageFacets={facets.languages}
            pdfCount={pdfCount}
            totalCount={schools.length}
            visibleCount={visibleSchools.length}
          />
          <SortBar filters={filters} onChange={setFilters} />
          <div className="flex min-h-0 flex-1">
            <SchoolList
              ref={listRef}
              schools={visibleSchools}
              selectedId={selectedId}
              expandedId={expandedId}
              today={today}
              onSelect={selectSchool}
              onCollapse={collapseCard}
            />
            <MapView
              schools={visibleSchools}
              landmarks={landmarks}
              selectedId={selectedId}
              today={today}
              onMarkerClick={handleSelectFromList}
            />
          </div>
        </>
      ) : (
        <CalendarView
          schools={schools}
          today={today}
          onSelectSchool={handleSelectFromCalendar}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-4 py-1.5 font-medium transition-colors ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
          : "text-slate-600 hover:bg-white/60"
      }`}
    >
      {children}
    </button>
  );
}

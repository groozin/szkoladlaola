import { useEffect, useMemo, useRef, useState } from "react";
import schoolsJson from "./data/schools.json";
import landmarksJson from "./data/landmarks.json";
import type { Landmark, School } from "./types";
import { SchoolList, type SchoolListHandle } from "./components/SchoolList";
import { MapView } from "./components/MapView";
import { CalendarView } from "./components/CalendarView";
import { FilterBar } from "./components/FilterBar";
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
    step4.sort((a, b) => {
      const ua = nextUpcoming(a.openDays, today);
      const ub = nextUpcoming(b.openDays, today);
      if (ua && ub) return ua.localeCompare(ub);
      if (ua) return -1;
      if (ub) return 1;
      return a.id.localeCompare(b.id);
    });
    return step4;
  }, [today, filters]);

  const handleSelectFromList = (id: string) => {
    setSelectedId(id);
    listRef.current?.scrollTo(id);
  };

  /** From calendar: jump to map with this school selected. */
  const handleSelectFromCalendar = (id: string) => {
    setSelectedId(id);
    setView("map");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-900">
          Krakowskie Licea — Dni Otwarte 2026
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
          <div className="flex min-h-0 flex-1">
            <SchoolList
              ref={listRef}
              schools={visibleSchools}
              selectedId={selectedId}
              today={today}
              onSelect={setSelectedId}
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

import { useEffect, useMemo, useRef, useState } from "react";
import schoolsJson from "./data/schools.json";
import landmarksJson from "./data/landmarks.json";
import type { Landmark, School } from "./types";
import { SchoolList, type SchoolListHandle } from "./components/SchoolList";
import { MapView } from "./components/MapView";
import { FilterBar } from "./components/FilterBar";
import { nextUpcoming, todayISO, formatDate } from "./utils/dates";
import {
  applyFiltersToSchool,
  buildFacets,
  filtersFromUrl,
  writeFiltersToUrl,
  type Filters,
} from "./utils/filters";

const schools = schoolsJson as School[];
const landmarks = landmarksJson as Landmark[];
const facets = buildFacets(schools);
const pdfCount = schools.filter((s) => s.inPdf).length;

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => filtersFromUrl());
  const listRef = useRef<SchoolListHandle>(null);

  useEffect(() => {
    writeFiltersToUrl(filters);
  }, [filters]);

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

  const handleMarkerClick = (id: string) => {
    setSelectedId(id);
    listRef.current?.scrollTo(id);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-900">
          Krakowskie Licea — Dni Otwarte 2026
        </h1>
        <p className="text-xs text-slate-500">stan na {formatDate(today)}</p>
      </header>

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
          onMarkerClick={handleMarkerClick}
        />
      </div>
    </div>
  );
}

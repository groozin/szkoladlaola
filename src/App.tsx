import { useMemo, useRef, useState } from "react";
import schoolsJson from "./data/schools.json";
import landmarksJson from "./data/landmarks.json";
import type { Landmark, School } from "./types";
import { SchoolList, type SchoolListHandle } from "./components/SchoolList";
import { MapView } from "./components/MapView";
import { nextUpcoming, todayISO, formatDate } from "./utils/dates";

const schools = schoolsJson as School[];
const landmarks = landmarksJson as Landmark[];

type Scope = "pdf" | "all";

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidePast, setHidePast] = useState(false);
  const [scope, setScope] = useState<Scope>("pdf");
  const listRef = useRef<SchoolListHandle>(null);

  const today = todayISO();
  const sortedSchools = useMemo(() => {
    const scoped = scope === "pdf" ? schools.filter((s) => s.inPdf) : schools;
    const copy = [...scoped];
    copy.sort((a, b) => {
      const ua = nextUpcoming(a.openDays, today);
      const ub = nextUpcoming(b.openDays, today);
      if (ua && ub) return ua.localeCompare(ub);
      if (ua) return -1;
      if (ub) return 1;
      return a.id.localeCompare(b.id);
    });
    return copy;
  }, [today, scope]);

  const visibleSchools = useMemo(
    () =>
      hidePast
        ? sortedSchools.filter((s) => nextUpcoming(s.openDays, today) !== null)
        : sortedSchools,
    [sortedSchools, hidePast, today],
  );

  const handleMarkerClick = (id: string) => {
    setSelectedId(id);
    listRef.current?.scrollTo(id);
  };

  const upcomingCount = sortedSchools.filter((s) => nextUpcoming(s.openDays, today)).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Krakowskie Licea — Dni Otwarte 2026
          </h1>
          <p className="text-xs text-slate-500">
            {upcomingCount} z {sortedSchools.length} liceów ma jeszcze zaplanowane dni
            otwarte (stan na {formatDate(today)}).
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-slate-600">
          <div className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
            <button
              type="button"
              onClick={() => setScope("pdf")}
              className={`px-3 py-1 ${
                scope === "pdf"
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Z PDF ({schools.filter((s) => s.inPdf).length})
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-3 py-1 ${
                scope === "all"
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Wszystkie ({schools.length})
            </button>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={hidePast}
              onChange={(e) => setHidePast(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Ukryj te po dniach otwartych
          </label>
        </div>
      </header>

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

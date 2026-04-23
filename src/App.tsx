import { useMemo, useRef, useState } from "react";
import schoolsJson from "./data/schools.json";
import type { School } from "./types";
import { SchoolList, type SchoolListHandle } from "./components/SchoolList";
import { MapView } from "./components/MapView";
import { nextUpcoming, todayISO, formatDate } from "./utils/dates";

const schools = schoolsJson as School[];

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidePast, setHidePast] = useState(false);
  const listRef = useRef<SchoolListHandle>(null);

  const today = todayISO();
  const sortedSchools = useMemo(() => {
    const copy = [...schools];
    copy.sort((a, b) => {
      const ua = nextUpcoming(a.openDays, today);
      const ub = nextUpcoming(b.openDays, today);
      if (ua && ub) return ua.localeCompare(ub);
      if (ua) return -1;
      if (ub) return 1;
      return a.id.localeCompare(b.id);
    });
    return copy;
  }, [today]);

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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={hidePast}
            onChange={(e) => setHidePast(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Ukryj licea, których dni otwarte już minęły
        </label>
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
          selectedId={selectedId}
          today={today}
          onMarkerClick={handleMarkerClick}
        />
      </div>
    </div>
  );
}

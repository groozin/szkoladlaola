import { useMemo, useState } from "react";
import type { School } from "../types";
import { formatDate } from "../utils/dates";
import { displayId } from "../utils/roman";
import { scheduleForDate } from "../utils/schedule";
import { buildIcsFile, downloadIcs, googleCalendarUrl } from "../utils/calendar-export";

type Props = {
  /** Full school dataset — calendar ignores filters on purpose. */
  schools: School[];
  today: string;
  /** Clicking a school jumps to the map view with that school selected. */
  onSelectSchool: (id: string) => void;
};

type DayEntries = { iso: string; date: Date; schools: School[] };

const DOW = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function indexByDate(schools: School[]): Map<string, School[]> {
  const m = new Map<string, School[]>();
  for (const s of schools) {
    for (const d of s.openDays) {
      const list = m.get(d) ?? [];
      list.push(s);
      m.set(d, list);
    }
  }
  // Sort schools within each day for stable display.
  for (const list of m.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return m;
}

function defaultMonth(schools: School[], today: string): { year: number; month: number } {
  const all = schools.flatMap((s) => s.openDays);
  const upcoming = all.filter((d) => d >= today).sort();
  const pick = upcoming[0] ?? all.sort()[0] ?? today;
  const [y, m] = pick.split("-").map(Number);
  return { year: y, month: m - 1 };
}

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const weekday = (first.getDay() + 6) % 7;           // Mon = 0
  const start = new Date(year, month, 1 - weekday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

export function CalendarView({ schools, today, onSelectSchool }: Props) {
  const [{ year, month }, setCursor] = useState(() => defaultMonth(schools, today));

  const byDate = useMemo(() => indexByDate(schools), [schools]);
  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });

  const prev = () => {
    const d = new Date(year, month - 1, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const next = () => {
    const d = new Date(year, month + 1, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goToToday = () =>
    setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 });

  const cells: DayEntries[] = grid.map((date) => {
    const iso = toIso(date);
    return { iso, date, schools: byDate.get(iso) ?? [] };
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
        <div className="text-sm font-semibold text-slate-800 first-letter:uppercase">
          {monthLabel}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const { content, eventCount } = buildIcsFile(schools);
              if (eventCount === 0) return;
              downloadIcs(content);
            }}
            title="Pobierz plik .ics ze wszystkimi dniami otwartymi"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-100"
          >
            Eksportuj kalendarz (.ics)
          </button>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={prev}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
            >
              dziś
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-medium text-slate-500">
        {DOW.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 auto-rows-fr overflow-y-auto">
        {cells.map((cell) => {
          const inMonth = cell.date.getMonth() === month;
          const isToday = cell.iso === today;
          const isPast = cell.iso < today;
          const hasSchools = cell.schools.length > 0;

          return (
            <div
              key={cell.iso}
              className={`flex min-h-[5rem] min-w-0 flex-col gap-1 border-b border-r border-slate-100 p-1.5 text-xs ${
                inMonth ? "bg-white" : "bg-slate-50 text-slate-400"
              } ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}`}
            >
              <div
                className={`flex items-center justify-between ${inMonth ? "text-slate-700" : ""}`}
              >
                <span className={`font-semibold ${isToday ? "text-blue-700" : ""}`}>
                  {cell.date.getDate()}
                </span>
                {hasSchools && inMonth && (
                  <span className="text-[10px] text-slate-400">{cell.schools.length}</span>
                )}
              </div>

              {hasSchools && (
                <ul className="flex min-w-0 flex-col gap-0.5">
                  {cell.schools.map((s) => {
                    const tone = isPast
                      ? "bg-red-50 text-red-800 hover:bg-red-100"
                      : "bg-green-50 text-green-800 hover:bg-green-100";
                    const desc = scheduleForDate(s.rawSchedule, cell.iso);
                    return (
                      <li
                        key={s.id}
                        className={`group min-w-0 rounded ${tone} ${
                          !s.isPublic ? "ring-1 ring-inset ring-purple-400" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-1 px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => onSelectSchool(s.id)}
                            title={`${displayId(s.id)} — ${s.fullName}\n${formatDate(cell.iso)}${
                              desc ? `\n${desc}` : ""
                            }`}
                            className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left leading-tight"
                          >
                            <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold">
                              {!s.isPublic && (
                                <span
                                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500"
                                  title="prywatna"
                                />
                              )}
                              <span className="truncate">{displayId(s.id)}</span>
                            </span>
                            {desc && (
                              <span className="line-clamp-2 w-full text-[10px] font-normal opacity-80">
                                {desc}
                              </span>
                            )}
                          </button>
                          <a
                            href={googleCalendarUrl(s, cell.iso)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Dodaj do Google Calendar"
                            aria-label="Dodaj do Google Calendar"
                            className="shrink-0 self-center rounded px-1 text-[11px] font-semibold leading-none opacity-40 hover:bg-black/10 hover:opacity-100 focus:opacity-100"
                          >
                            +
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

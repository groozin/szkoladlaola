import { useEffect, useMemo, useState } from "react";
import type { School } from "../types";
import { formatDate } from "../utils/dates";
import { displayId } from "../utils/roman";
import { scheduleForDate } from "../utils/schedule";
import { buildIcsFile, downloadIcs, googleCalendarUrl } from "../utils/calendar-export";
import { CalendarPlusIcon } from "./CalendarPlusIcon";
import { calModeFromUrl, writeCalModeToUrl, type CalMode } from "../utils/filters";

type Props = {
  /** Full school dataset — calendar ignores filters on purpose. */
  schools: School[];
  today: string;
  /** Clicking a school jumps to the map view with that school selected. */
  onSelectSchool: (id: string) => void;
};

const DOW = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

function schoolsCountLabel(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return `${n} szkoła`;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} szkoły`;
  return `${n} szkół`;
}

const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function indexByDate(schools: School[]): Map<string, School[]> {
  const m = new Map<string, School[]>();
  for (const s of schools) {
    for (const d of s.openDays) {
      const list = m.get(d) ?? [];
      list.push(s);
      m.set(d, list);
    }
  }
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

function defaultWeekAnchorIso(schools: School[], today: string): string {
  const all = schools.flatMap((s) => s.openDays);
  const upcoming = all.filter((d) => d >= today).sort();
  return upcoming[0] ?? today;
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const weekday = (first.getDay() + 6) % 7; // Mon = 0
  const start = new Date(year, month, 1 - weekday);
  return Array.from({ length: 42 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

function buildWeekGrid(anchorIso: string): Date[] {
  const a = parseIso(anchorIso);
  const weekday = (a.getDay() + 6) % 7;
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate() - weekday);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

export function CalendarView({ schools, today, onSelectSchool }: Props) {
  const [mode, setMode] = useState<CalMode>(() => calModeFromUrl());
  const [{ year, month }, setMonthCursor] = useState(() => defaultMonth(schools, today));
  const [weekAnchor, setWeekAnchor] = useState<string>(() =>
    defaultWeekAnchorIso(schools, today),
  );

  useEffect(() => writeCalModeToUrl(mode), [mode]);

  const byDate = useMemo(() => indexByDate(schools), [schools]);

  const headerLabel = useMemo(() => {
    if (mode === "month") {
      return new Date(year, month, 1).toLocaleDateString("pl-PL", {
        month: "long",
        year: "numeric",
      });
    }
    if (mode === "week") {
      const days = buildWeekGrid(weekAnchor);
      const first = days[0];
      const last = days[6];
      const sameMonth =
        first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
      if (sameMonth) {
        const monthName = first.toLocaleDateString("pl-PL", { month: "long" });
        return `${first.getDate()}–${last.getDate()} ${monthName} ${first.getFullYear()}`;
      }
      const left = first.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
      const right = last.toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return `${left} – ${right}`;
    }
    return "Najbliższe dni otwarte";
  }, [mode, year, month, weekAnchor]);

  // prev/next/today work differently per mode; agenda has no nav.
  const nav = useMemo(() => {
    if (mode === "month") {
      return {
        prev: () => {
          const d = new Date(year, month - 1, 1);
          setMonthCursor({ year: d.getFullYear(), month: d.getMonth() });
        },
        next: () => {
          const d = new Date(year, month + 1, 1);
          setMonthCursor({ year: d.getFullYear(), month: d.getMonth() });
        },
        today: () =>
          setMonthCursor({
            year: Number(today.slice(0, 4)),
            month: Number(today.slice(5, 7)) - 1,
          }),
      };
    }
    if (mode === "week") {
      const shift = (delta: number) => {
        const a = parseIso(weekAnchor);
        const next = new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta);
        setWeekAnchor(toIso(next));
      };
      return {
        prev: () => shift(-7),
        next: () => shift(7),
        today: () => setWeekAnchor(today),
      };
    }
    return null;
  }, [mode, year, month, weekAnchor, today]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2">
        <div className="text-sm font-semibold text-slate-800 first-letter:uppercase">
          {headerLabel}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ModePicker mode={mode} onChange={setMode} />
          <button
            type="button"
            onClick={() => {
              const { content, eventCount } = buildIcsFile(schools);
              if (eventCount === 0) return;
              downloadIcs(content);
            }}
            title="Pobierz plik .ics ze wszystkimi dniami otwartymi"
            aria-label="Eksportuj kalendarz (.ics)"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100 sm:py-0.5"
          >
            <span className="sm:hidden">.ics</span>
            <span className="hidden sm:inline">Eksportuj kalendarz (.ics)</span>
          </button>
          {nav && (
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={nav.prev}
                aria-label="Poprzedni"
                className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 sm:px-2 sm:py-0.5"
              >
                ←
              </button>
              <button
                type="button"
                onClick={nav.today}
                className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 sm:px-2 sm:py-0.5"
              >
                dziś
              </button>
              <button
                type="button"
                onClick={nav.next}
                aria-label="Następny"
                className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 sm:px-2 sm:py-0.5"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {mode === "month" && (
        <MonthGrid
          year={year}
          month={month}
          today={today}
          byDate={byDate}
          onSelectSchool={onSelectSchool}
        />
      )}
      {mode === "week" && (
        <WeekGrid
          anchorIso={weekAnchor}
          today={today}
          byDate={byDate}
          onSelectSchool={onSelectSchool}
        />
      )}
      {mode === "agenda" && (
        <AgendaList today={today} byDate={byDate} onSelectSchool={onSelectSchool} />
      )}
    </div>
  );
}

// ---------- mode picker ----------

const MODE_LABEL: Record<CalMode, string> = {
  month: "Miesiąc",
  week: "Tydzień",
  agenda: "Lista",
};

function ModePicker({ mode, onChange }: { mode: CalMode; onChange: (m: CalMode) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
      {(Object.keys(MODE_LABEL) as CalMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-2.5 py-1 sm:py-0.5 ${
            mode === m
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

// ---------- month ----------

type MonthGridProps = {
  year: number;
  month: number;
  today: string;
  byDate: Map<string, School[]>;
  onSelectSchool: (id: string) => void;
};

function MonthGrid({ year, month, today, byDate, onSelectSchool }: MonthGridProps) {
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  return (
    <>
      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-medium text-slate-500">
        {DOW.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 auto-rows-fr overflow-y-auto">
        {grid.map((date) => {
          const iso = toIso(date);
          return (
            <DayCell
              key={iso}
              date={date}
              iso={iso}
              schools={byDate.get(iso) ?? []}
              today={today}
              dim={date.getMonth() !== month}
              onSelectSchool={onSelectSchool}
              compactNumber
            />
          );
        })}
      </div>
    </>
  );
}

// ---------- week ----------

type WeekGridProps = {
  anchorIso: string;
  today: string;
  byDate: Map<string, School[]>;
  onSelectSchool: (id: string) => void;
};

function WeekGrid({ anchorIso, today, byDate, onSelectSchool }: WeekGridProps) {
  const days = useMemo(() => buildWeekGrid(anchorIso), [anchorIso]);
  return (
    <>
      <div className="hidden grid-cols-7 border-b border-slate-200 text-center text-[11px] font-medium text-slate-500 md:grid">
        {DOW.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 overflow-y-auto md:grid-cols-7">
        {days.map((date, idx) => {
          const iso = toIso(date);
          return (
            <DayCell
              key={iso}
              date={date}
              iso={iso}
              schools={byDate.get(iso) ?? []}
              today={today}
              dim={false}
              onSelectSchool={onSelectSchool}
              tallMobile
              dayName={DOW[idx]}
            />
          );
        })}
      </div>
    </>
  );
}

// ---------- day cell (month + week share this) ----------

type DayCellProps = {
  date: Date;
  iso: string;
  schools: School[];
  today: string;
  /** True for days outside the active month (month grid only). */
  dim: boolean;
  onSelectSchool: (id: string) => void;
  /** Compact number badge in the top-right (month grid). */
  compactNumber?: boolean;
  /** On mobile, render the day label as a header strip ("Pn 12 maja"). Used by week view. */
  tallMobile?: boolean;
  /** Two-letter weekday — required for `tallMobile`. */
  dayName?: string;
};

function DayCell({
  date,
  iso,
  schools,
  today,
  dim,
  onSelectSchool,
  compactNumber,
  tallMobile,
  dayName,
}: DayCellProps) {
  const isToday = iso === today;
  const isPast = iso < today;
  const hasSchools = schools.length > 0;

  return (
    <div
      className={`flex min-w-0 flex-col gap-1 border-b border-r border-slate-100 p-1 text-xs sm:p-1.5 ${
        tallMobile ? "min-h-[4rem] md:min-h-[8rem]" : "min-h-[3.5rem] sm:min-h-[5rem]"
      } ${dim ? "bg-slate-50 text-slate-400" : "bg-white"} ${
        isToday ? "ring-2 ring-inset ring-blue-400" : ""
      }`}
    >
      <div className={`flex items-center justify-between ${dim ? "" : "text-slate-700"}`}>
        <span className={`font-semibold ${isToday ? "text-blue-700" : ""}`}>
          {tallMobile && dayName ? (
            <>
              <span className="md:hidden">
                {dayName} {date.getDate()}
                <span className="text-slate-400">
                  {" "}
                  {date.toLocaleDateString("pl-PL", { month: "short" })}
                </span>
              </span>
              <span className="hidden md:inline">{date.getDate()}</span>
            </>
          ) : (
            date.getDate()
          )}
        </span>
        {hasSchools && !dim && compactNumber && (
          <span className="text-[10px] text-slate-400">{schools.length}</span>
        )}
      </div>

      {hasSchools && (
        <ul className="flex min-w-0 flex-col gap-0.5">
          {schools.map((s) => (
            <SchoolPill
              key={s.id}
              school={s}
              iso={iso}
              isPast={isPast}
              onSelect={onSelectSchool}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SchoolPill({
  school,
  iso,
  isPast,
  onSelect,
}: {
  school: School;
  iso: string;
  isPast: boolean;
  onSelect: (id: string) => void;
}) {
  const tone = isPast
    ? "bg-red-50 text-red-800 hover:bg-red-100"
    : "bg-green-50 text-green-800 hover:bg-green-100";
  const desc = scheduleForDate(school.rawSchedule, iso);
  return (
    <li
      className={`group min-w-0 rounded ${tone} ${
        !school.isPublic ? "ring-1 ring-inset ring-purple-400" : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-1 px-1 py-0.5">
        <button
          type="button"
          onClick={() => onSelect(school.id)}
          title={`${displayId(school.id)} — ${school.fullName}\n${formatDate(iso)}${
            desc ? `\n${desc}` : ""
          }`}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left leading-tight"
        >
          <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold">
            {!school.isPublic && (
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500"
                title="prywatna"
              />
            )}
            <span className="truncate">{displayId(school.id)}</span>
          </span>
          {desc && (
            <span className="line-clamp-2 w-full text-[10px] font-normal opacity-80">
              {desc}
            </span>
          )}
        </button>
        <a
          href={googleCalendarUrl(school, iso)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Dodaj do Google Calendar"
          aria-label="Dodaj do Google Calendar"
          className="shrink-0 self-center rounded p-0.5 opacity-50 hover:bg-black/10 hover:opacity-100 focus:opacity-100"
        >
          <CalendarPlusIcon size={15} />
        </a>
      </div>
    </li>
  );
}

// ---------- agenda ----------

type AgendaListProps = {
  today: string;
  byDate: Map<string, School[]>;
  onSelectSchool: (id: string) => void;
};

function AgendaList({ today, byDate, onSelectSchool }: AgendaListProps) {
  const [showPast, setShowPast] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const dates = Array.from(byDate.keys()).sort();
    return {
      upcoming: dates.filter((d) => d >= today),
      past: dates.filter((d) => d < today).reverse(), // most recent first
    };
  }, [byDate, today]);

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Brak zaplanowanych dni otwartych.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {upcoming.length === 0 && (
        <p className="px-4 py-6 text-sm text-slate-500">
          Brak nadchodzących dni otwartych.
        </p>
      )}
      <ul className="divide-y divide-slate-200">
        {upcoming.map((iso) => (
          <AgendaDay
            key={iso}
            iso={iso}
            schools={byDate.get(iso) ?? []}
            isPast={false}
            onSelectSchool={onSelectSchool}
          />
        ))}
      </ul>

      {past.length > 0 && (
        <div className="border-t-4 border-slate-100">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="w-full px-4 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
          >
            {showPast ? "▲ Ukryj minione" : "▼ Pokaż minione"} ({past.length})
          </button>
          {showPast && (
            <ul className="divide-y divide-slate-200">
              {past.map((iso) => (
                <AgendaDay
                  key={iso}
                  iso={iso}
                  schools={byDate.get(iso) ?? []}
                  isPast
                  onSelectSchool={onSelectSchool}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AgendaDay({
  iso,
  schools,
  isPast,
  onSelectSchool,
}: {
  iso: string;
  schools: School[];
  isPast: boolean;
  onSelectSchool: (id: string) => void;
}) {
  const date = parseIso(iso);
  const weekday = date.toLocaleDateString("pl-PL", { weekday: "long" });
  const longDate = date.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <li className={isPast ? "opacity-70" : ""}>
      <div
        className={`sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-1.5 text-xs ${
          isPast ? "bg-slate-50 text-slate-500" : "bg-slate-50 text-slate-700"
        }`}
      >
        <span>
          <span className="font-semibold capitalize">{weekday}</span>
          <span className="ml-2 text-slate-500">{longDate}</span>
        </span>
        <span className="text-slate-400">{schoolsCountLabel(schools.length)}</span>
      </div>
      <ul className="divide-y divide-slate-100 bg-white">
        {schools.map((s) => (
          <AgendaRow
            key={s.id}
            school={s}
            iso={iso}
            isPast={isPast}
            onSelect={onSelectSchool}
          />
        ))}
      </ul>
    </li>
  );
}

function AgendaRow({
  school,
  iso,
  isPast,
  onSelect,
}: {
  school: School;
  iso: string;
  isPast: boolean;
  onSelect: (id: string) => void;
}) {
  const desc = scheduleForDate(school.rawSchedule, iso);
  const dot = isPast ? "bg-red-400" : "bg-green-500";
  return (
    <li>
      <div className="flex min-w-0 items-start gap-2 px-4 py-2 hover:bg-slate-50">
        <span
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dot}`}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => onSelect(school.id)}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left leading-tight"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-900">
            {!school.isPublic && (
              <span className="rounded bg-purple-100 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                prywatna
              </span>
            )}
            <span className="truncate">{displayId(school.id)}</span>
          </span>
          <span className="line-clamp-1 text-xs text-slate-600">{school.fullName}</span>
          {desc && <span className="text-[11px] text-slate-500">{desc}</span>}
        </button>
        <a
          href={googleCalendarUrl(school, iso)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Dodaj do Google Calendar"
          aria-label="Dodaj do Google Calendar"
          className="shrink-0 self-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <CalendarPlusIcon size={18} />
        </a>
      </div>
    </li>
  );
}

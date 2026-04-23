import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { School } from "../types";
import { formatDate, humanCountdown, nextUpcoming } from "../utils/dates";
import { displayId } from "../utils/roman";
import { classDisplay, classesLabel, thresholdRange } from "../utils/classes";
import { googleCalendarUrl } from "../utils/calendar-export";
import { scheduleForDate } from "../utils/schedule";
import { CalendarPlusIcon } from "./CalendarPlusIcon";

export type SchoolListHandle = {
  scrollTo: (id: string) => void;
};

type Props = {
  schools: School[];
  selectedId: string | null;
  /** Which card is currently expanded to show rawSchedule + classes.
   *  Typically mirrors selectedId, but can be cleared independently. */
  expandedId: string | null;
  today: string;
  onSelect: (id: string) => void;
  onCollapse: () => void;
};

export const SchoolList = forwardRef<SchoolListHandle, Props>(function SchoolList(
  { schools, selectedId, expandedId, today, onSelect, onCollapse },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  useImperativeHandle(ref, () => ({
    scrollTo: (id: string) => {
      const el = itemRefs.current.get(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  }));

  useEffect(() => {
    if (!selectedId) return;
    const el = itemRefs.current.get(selectedId);
    if (el && containerRef.current) {
      const rect = el.getBoundingClientRect();
      const cRect = containerRef.current.getBoundingClientRect();
      if (rect.top < cRect.top || rect.bottom > cRect.bottom) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selectedId]);

  return (
    <aside
      ref={containerRef}
      className="w-[28rem] shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50"
    >
      <ul className="divide-y divide-slate-200">
        {schools.map((s) => {
          const upcoming = nextUpcoming(s.openDays, today);
          const isSelected = s.id === selectedId;
          const bg = upcoming
            ? isSelected
              ? "bg-green-100"
              : "bg-green-50 hover:bg-green-100"
            : s.openDays.length === 0
              ? isSelected
                ? "bg-amber-100"
                : "bg-amber-50 hover:bg-amber-100"
              : isSelected
                ? "bg-red-100"
                : "bg-red-50 hover:bg-red-100";
          const range = thresholdRange(s.classes);
          const isExpanded = s.id === expandedId;
          return (
            <li
              key={s.id}
              ref={(el) => {
                if (el) itemRefs.current.set(s.id, el);
                else itemRefs.current.delete(s.id);
              }}
              className={`cursor-pointer px-4 py-3 transition-colors ${bg} ${
                isSelected ? "ring-2 ring-inset ring-blue-400" : ""
              }`}
              onClick={() => onSelect(s.id)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5">
                  {!s.isPublic && (
                    <span className="rounded bg-purple-100 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                      prywatna
                    </span>
                  )}
                  <span className="font-semibold text-slate-900">{displayId(s.id)}</span>
                </div>
                <span
                  className={`text-xs font-medium ${
                    upcoming
                      ? "text-green-700"
                      : s.openDays.length
                        ? "text-red-700"
                        : "text-amber-700"
                  }`}
                >
                  {upcoming
                    ? humanCountdown(upcoming, today)
                    : s.openDays.length
                      ? "wszystkie minęły"
                      : "brak dni otwartych"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-600">{s.fullName}</div>
              <div className="mt-1 text-xs text-slate-500">
                {s.district ? `${s.district} • ` : ""}
                {s.address}
                {s.postalCode ? `, ${s.postalCode}` : ""}
              </div>

              {(s.classes.length > 0 || range || s.rankMalopolska != null) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
                  {s.rankMalopolska != null && (
                    <a
                      href="https://2025.licea.perspektywy.pl/rankingi/ranking-malopolski"
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Zobacz Ranking Perspektywy 2025"
                      className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-900 ring-1 ring-yellow-400/60 hover:bg-yellow-200"
                    >
                      🏆 <span className="font-semibold tabular-nums">#{s.rankMalopolska}</span>{" "}
                      małopolskie
                      {s.rankPoland != null && (
                        <>
                          {" "}
                          <span className="opacity-60">·</span>{" "}
                          <span className="font-semibold tabular-nums">#{s.rankPoland}</span> Polska
                        </>
                      )}
                    </a>
                  )}
                  {s.classes.length > 0 && <span>📚 {classesLabel(s.classes.length)}</span>}
                  {range && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 ring-1 ring-amber-300/50">
                      <span className="text-[10px] uppercase tracking-wide opacity-70">
                        próg {range.year.split("/")[0]}
                      </span>{" "}
                      <span className="font-semibold tabular-nums">
                        {range.min === range.max
                          ? range.min.toFixed(2)
                          : `${range.min.toFixed(2)}–${range.max.toFixed(2)}`}
                      </span>{" "}
                      pkt
                    </span>
                  )}
                </div>
              )}

              {s.openDays.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {s.openDays.map((d) => {
                    const past = d < today;
                    return (
                      <li
                        key={d}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                          past
                            ? "bg-red-200 text-red-800"
                            : "bg-green-200 text-green-800"
                        }`}
                      >
                        <span className={past ? "line-through" : undefined}>
                          {formatDate(d)}
                        </span>
                        {!past && (
                          <a
                            href={googleCalendarUrl(s, d)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Dodaj do Google Calendar"
                            aria-label="Dodaj do Google Calendar"
                            className="inline-flex items-center opacity-60 hover:opacity-100"
                          >
                            <CalendarPlusIcon size={13} />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {isExpanded && (
                <div className="mt-3 border-t border-slate-200 pt-2">
                  {s.rawSchedule && (
                    <section className="mb-3">
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Dni otwarte — szczegóły
                      </h3>
                      {(() => {
                        const perDate = s.openDays.map((iso) => ({
                          iso,
                          past: iso < today,
                          desc: scheduleForDate(s.rawSchedule, iso),
                        }));
                        const anyDesc = perDate.some((x) => x.desc);
                        // Fall back to the raw blob for things like "16-17.04.2026"
                        // where we can't pick out a per-date slice.
                        if (!anyDesc || perDate.length === 0) {
                          return (
                            <p className="text-[11px] italic text-slate-600">{s.rawSchedule}</p>
                          );
                        }
                        return (
                          <ul className="space-y-0.5">
                            {perDate.map(({ iso, past, desc }) => (
                              <li key={iso} className="text-[11px] leading-snug">
                                <span
                                  className={`font-medium tabular-nums ${
                                    past ? "text-red-700" : "text-green-700"
                                  }`}
                                >
                                  {formatDate(iso)}
                                </span>
                                {desc && (
                                  <>
                                    <span className="text-slate-400"> — </span>
                                    <span className="italic text-slate-600">{desc}</span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </section>
                  )}
                  {s.classes.length > 0 && (
                    <section
                      className={
                        s.rawSchedule
                          ? "mb-3 border-t border-slate-200 pt-2"
                          : "mb-3"
                      }
                    >
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Klasy {s.classesYear ?? ""}
                      </div>
                      <ul className="space-y-1.5">
                        {s.classes.map((c) => (
                          <li key={c.code} className="rounded bg-white/70 px-2 py-1 text-xs">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-medium text-slate-800">{classDisplay(c)}</span>
                              {c.thresholdMin != null && (
                                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 ring-1 ring-amber-300/50">
                                  <span className="text-[10px] uppercase tracking-wide opacity-70">
                                    próg {c.thresholdYear?.split("/")[0]}
                                  </span>{" "}
                                  <span className="font-semibold tabular-nums">
                                    {c.thresholdMin.toFixed(2)}
                                  </span>
                                </span>
                              )}
                            </div>
                            {c.extendedSubjects.length > 0 && (
                              <div className="mt-0.5 text-[11px] text-slate-600">
                                <span className="text-slate-400">rozszerzone: </span>
                                {c.extendedSubjects.join(", ")}
                              </div>
                            )}
                            {c.languages.length > 0 && (
                              <div className="text-[11px] text-slate-500">
                                <span className="text-slate-400">języki: </span>
                                {c.languages.join(", ")}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {(s.website || s.otouczelnieUrl) && (
                    <div className="flex gap-3 text-[11px]">
                      {s.website && (
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          strona szkoły ↗
                        </a>
                      )}
                      {s.otouczelnieUrl && (
                        <a
                          href={s.otouczelnieUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          otouczelnie.pl ↗
                        </a>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCollapse();
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-1 rounded border border-slate-200 bg-white/60 py-1 text-[11px] text-slate-500 hover:bg-white"
                  >
                    ▲ zwiń
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
});

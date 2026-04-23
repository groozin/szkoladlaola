import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { School } from "../types";
import { formatDate, humanCountdown, nextUpcoming } from "../utils/dates";
import { displayId } from "../utils/roman";
import { classDisplay, classesLabel, thresholdRange } from "../utils/classes";

export type SchoolListHandle = {
  scrollTo: (id: string) => void;
};

type Props = {
  schools: School[];
  selectedId: string | null;
  today: string;
  onSelect: (id: string) => void;
};

export const SchoolList = forwardRef<SchoolListHandle, Props>(function SchoolList(
  { schools, selectedId, today, onSelect },
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
            : isSelected
              ? "bg-red-100"
              : "bg-red-50 hover:bg-red-100";
          const range = thresholdRange(s.classes);
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
                <span className="font-semibold text-slate-900">{displayId(s.id)}</span>
                <span
                  className={`text-xs font-medium ${
                    upcoming ? "text-green-700" : s.openDays.length ? "text-red-700" : "text-slate-400"
                  }`}
                >
                  {upcoming
                    ? humanCountdown(upcoming, today)
                    : s.openDays.length
                      ? "wszystkie minęły"
                      : "brak dni otwartych"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-600">
                {!s.isPublic && (
                  <span className="mr-1 rounded bg-purple-100 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                    prywatna
                  </span>
                )}
                {s.fullName}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {s.district ? `${s.district} • ` : ""}
                {s.address}
                {s.postalCode ? `, ${s.postalCode}` : ""}
              </div>

              {(s.classes.length > 0 || range) && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                  {s.classes.length > 0 && <span>📚 {classesLabel(s.classes.length)}</span>}
                  {range && (
                    <span>
                      próg {range.year.split("/")[0]}:{" "}
                      <span className="font-medium text-slate-800">
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
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          past
                            ? "bg-red-200 text-red-800 line-through"
                            : "bg-green-200 text-green-800"
                        }`}
                      >
                        {formatDate(d)}
                      </li>
                    );
                  })}
                </ul>
              )}

              {isSelected && (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-2">
                  {s.rawSchedule && (
                    <div className="text-[11px] italic text-slate-500">{s.rawSchedule}</div>
                  )}
                  {s.classes.length > 0 && (
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Klasy {s.classesYear ?? ""}
                      </div>
                      <ul className="space-y-1.5">
                        {s.classes.map((c) => (
                          <li key={c.code} className="rounded bg-white/70 px-2 py-1 text-xs">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-medium text-slate-800">{classDisplay(c)}</span>
                              {c.thresholdMin != null && (
                                <span className="text-slate-600">
                                  próg {c.thresholdYear?.split("/")[0]}:{" "}
                                  <span className="font-medium">{c.thresholdMin.toFixed(2)}</span>
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
                    </div>
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
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
});

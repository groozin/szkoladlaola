import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { School } from "../types";
import { formatDate, humanCountdown, nextUpcoming } from "../utils/dates";
import { displayId } from "../utils/roman";

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
      className="w-[26rem] shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50"
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
                  className={`text-xs font-medium ${upcoming ? "text-green-700" : "text-red-700"}`}
                >
                  {upcoming ? humanCountdown(upcoming, today) : "wszystkie minęły"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-600">{s.fullName}</div>
              <div className="mt-1 text-xs text-slate-500">
                {s.address}, {s.postalCode}
              </div>
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
              {isSelected && (
                <div className="mt-2 text-[11px] italic text-slate-500">{s.rawSchedule}</div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
});

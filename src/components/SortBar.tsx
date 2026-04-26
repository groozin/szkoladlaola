import type { Filters, SortMode } from "../utils/filters";
import { DEFAULT_SORT_DIR } from "../utils/filters";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
};

const LABEL: Record<SortMode, string> = {
  upcoming: "Dni otwarte",
  rank: "Ranking",
  threshold: "Próg",
};

export function SortBar({ filters, onChange }: Props) {
  const click = (mode: SortMode) => {
    if (filters.sort === mode) {
      onChange({ ...filters, sortDir: filters.sortDir === "asc" ? "desc" : "asc" });
    } else {
      onChange({ ...filters, sort: mode, sortDir: DEFAULT_SORT_DIR[mode] });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs sm:px-6">
      <span className="text-slate-500">Sortuj:</span>
      {(Object.keys(LABEL) as SortMode[]).map((mode) => (
        <Button
          key={mode}
          mode={mode}
          active={filters.sort === mode}
          dir={filters.sort === mode ? filters.sortDir : undefined}
          onClick={() => click(mode)}
        />
      ))}
      {filters.sort !== "upcoming" && (
        <button
          type="button"
          onClick={() =>
            onChange({ ...filters, sort: "upcoming", sortDir: DEFAULT_SORT_DIR.upcoming })
          }
          className="ml-auto text-slate-500 hover:underline"
          title="Wróć do domyślnego sortowania"
        >
          reset
        </button>
      )}
    </div>
  );
}

function Button({
  mode,
  active,
  dir,
  onClick,
}: {
  mode: SortMode;
  active: boolean;
  dir: "asc" | "desc" | undefined;
  onClick: () => void;
}) {
  const arrow = dir === "asc" ? "↑" : dir === "desc" ? "↓" : "";
  const arrowTitle = dir === "asc" ? "rosnąco" : dir === "desc" ? "malejąco" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        active
          ? `Sortowanie: ${LABEL[mode]} ${arrowTitle} — kliknij, aby odwrócić`
          : `Sortuj wg: ${LABEL[mode]}`
      }
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 transition-colors ${
        active
          ? "border-blue-500 bg-blue-600 text-white shadow-sm"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
      aria-pressed={active}
    >
      <span>{LABEL[mode]}</span>
      {active && <span className="tabular-nums">{arrow}</span>}
    </button>
  );
}

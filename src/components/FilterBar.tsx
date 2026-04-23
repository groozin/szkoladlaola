import { useState } from "react";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  hasAnyFilter,
  type FacetValue,
  type Filters,
  type Scope,
} from "../utils/filters";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  subjectFacets: FacetValue[];
  languageFacets: FacetValue[];
  pdfCount: number;
  totalCount: number;
  visibleCount: number;
};

/** Polish pluralisation for "liceum": 1 → liceum; 2–4 (not 12–14) → licea; else liceów. */
function schoolsLabel(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return "1 liceum";
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} licea`;
  return `${n} liceów`;
}

const THRESHOLD_MAX = 200;
const THRESHOLD_SLIDER_STEP = 5;

export function FilterBar({
  filters,
  onChange,
  subjectFacets,
  languageFacets,
  pdfCount,
  totalCount,
  visibleCount,
}: Props) {
  const [expanded, setExpanded] = useState(hasAnyFilter(filters));
  const count = activeFilterCount(filters);

  const toggle = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const setSubject = (v: string) =>
    onChange({ ...filters, subjects: toggle(filters.subjects, v) });
  const setLanguage = (v: string) =>
    onChange({ ...filters, languages: toggle(filters.languages, v) });
  const setThreshold = (raw: string | number) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      onChange({ ...filters, thresholdMin: null });
      return;
    }
    const clamped = Math.max(0, Math.min(THRESHOLD_MAX, Math.round(n)));
    onChange({ ...filters, thresholdMin: clamped === 0 ? null : clamped });
  };
  const setScope = (scope: Scope) => onChange({ ...filters, scope });
  const setHidePast = (hidePast: boolean) => onChange({ ...filters, hidePast });
  const setIncludePrivate = (includePrivate: boolean) =>
    onChange({ ...filters, includePrivate });
  const clearAll = () => onChange({ ...DEFAULT_FILTERS });

  const sliderValue = filters.thresholdMin ?? 0;

  return (
    <div className="border-b border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex min-h-[2.5rem] w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 py-1.5 text-left text-sm leading-5 text-slate-700 hover:bg-slate-50"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-medium">Filtry</span>
          {count === 0 && <span className="text-xs text-slate-400">brak</span>}
          {filters.scope !== DEFAULT_FILTERS.scope && <Badge tone="slate">wszystkie</Badge>}
          {filters.hidePast && <Badge tone="slate">ukryj minione</Badge>}
          {filters.includePrivate && <Badge tone="purple">+ prywatne</Badge>}
          {filters.thresholdMin != null && (
            <Badge tone="slate">próg ≥ {filters.thresholdMin}</Badge>
          )}
          {filters.subjects.map((s) => (
            <Badge key={`s-${s}`} tone="blue">
              {s}
            </Badge>
          ))}
          {filters.languages.map((l) => (
            <Badge key={`l-${l}`} tone="green">
              {l}
            </Badge>
          ))}
        </span>
        <span className="flex items-center gap-3 text-xs">
          <span className="font-medium tabular-nums text-slate-700">
            {schoolsLabel(visibleCount)}
          </span>
          {hasAnyFilter(filters) && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  clearAll();
                }
              }}
              className="cursor-pointer text-slate-500 hover:underline"
            >
              Wyczyść
            </span>
          )}
          <span className="text-slate-400">{expanded ? "▲ zwiń" : "▼ rozwiń"}</span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 px-6 pb-4 pt-1">
          {/* School-level filters */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-700">
            <div className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setScope("pdf")}
                className={`px-3 py-1 ${
                  filters.scope === "pdf"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                Z PDF ({pdfCount})
              </button>
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`px-3 py-1 ${
                  filters.scope === "all"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                Wszystkie ({totalCount})
              </button>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.hidePast}
                onChange={(e) => setHidePast(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Ukryj minione
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.includePrivate}
                onChange={(e) => setIncludePrivate(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Pokaż prywatne
            </label>
          </div>

          {/* Class-level filters. Fixed narrow column for the threshold so the
              subjects and languages pill grids get the remaining space. */}
          <div className="grid gap-6 md:grid-cols-[14rem_1fr_1fr]">
            <Column title="Minimalny próg punktowy">
              <div className="max-w-48">
                <div className="mb-1 flex items-baseline gap-1">
                  <input
                    type="number"
                    value={sliderValue}
                    onChange={(e) => setThreshold(e.target.value)}
                    min={0}
                    max={THRESHOLD_MAX}
                    step={1}
                    className={`w-20 rounded border border-slate-300 px-2 py-0.5 text-right text-base font-medium tabular-nums focus:border-blue-500 focus:outline-none ${
                      sliderValue > 0 ? "text-slate-900" : "text-slate-400"
                    }`}
                  />
                  <span className="text-sm text-slate-500">pkt</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={THRESHOLD_MAX}
                  step={THRESHOLD_SLIDER_STEP}
                  value={sliderValue}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>0</span>
                  <span>{THRESHOLD_MAX}</span>
                </div>
              </div>
            </Column>

            <Column title="Rozszerzone przedmioty">
              <FacetPills
                facets={subjectFacets}
                selected={filters.subjects}
                onToggle={setSubject}
                tone="blue"
              />
            </Column>

            <Column title="Języki">
              <FacetPills
                facets={languageFacets}
                selected={filters.languages}
                onToggle={setLanguage}
                tone="green"
              />
            </Column>
          </div>
        </div>
      )}
    </div>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      {children}
    </div>
  );
}

type Tone = "blue" | "green" | "slate" | "purple";

const badgeClasses: Record<Tone, string> = {
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  slate: "bg-slate-200 text-slate-800",
  purple: "bg-purple-100 text-purple-800",
};

function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClasses[tone]}`}>
      {children}
    </span>
  );
}

const activePillClasses: Record<Tone, string> = {
  blue: "border-blue-500 bg-blue-600 text-white",
  green: "border-green-500 bg-green-600 text-white",
  slate: "border-slate-500 bg-slate-700 text-white",
  purple: "border-purple-500 bg-purple-600 text-white",
};

const activeCountClasses: Record<Tone, string> = {
  blue: "text-blue-100",
  green: "text-green-100",
  slate: "text-slate-200",
  purple: "text-purple-100",
};

function FacetPills({
  facets,
  selected,
  onToggle,
  tone,
}: {
  facets: FacetValue[];
  selected: string[];
  onToggle: (v: string) => void;
  tone: Tone;
}) {
  if (facets.length === 0) {
    return <div className="text-xs text-slate-400">brak danych</div>;
  }
  return (
    <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto pr-1">
      {facets.map((f) => {
        const active = selected.includes(f.value);
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onToggle(f.value)}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              active
                ? activePillClasses[tone]
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {f.value}
            <span
              className={`ml-1 text-[10px] ${
                active ? activeCountClasses[tone] : "text-slate-400"
              }`}
            >
              {f.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

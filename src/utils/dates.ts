/** Today's date in local time, formatted as YYYY-MM-DD for string compare. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Earliest upcoming open day (>= today), or null if all are past. */
export function nextUpcoming(openDays: string[], today = todayISO()): string | null {
  for (const d of openDays) if (d >= today) return d;
  return null;
}

/** Nicely formatted Polish date, e.g. "czw., 23 kwi 2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Plain-language Polish countdown: "dziś", "jutro", "za 3 dni". */
export function humanCountdown(targetIso: string, today = todayISO()): string {
  const a = new Date(today + "T00:00:00");
  const b = new Date(targetIso + "T00:00:00");
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (days <= 0) return "dziś";
  if (days === 1) return "jutro";
  return `za ${days} dni`;
}

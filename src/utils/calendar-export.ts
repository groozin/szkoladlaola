/**
 * Two export paths to calendar apps:
 *   - googleCalendarUrl(s, iso) builds a one-click "add event" link that
 *     opens Google Calendar with the event prefilled.
 *   - buildIcs(schools) emits a complete iCalendar file with every open day
 *     as an all-day event — importable by Google Calendar, Apple Calendar,
 *     Outlook, Fastmail, etc.
 *
 * All events are all-day (date-only values) because the PDF often gives us
 * only a date, and when it does give a time window we stuff it into the
 * description rather than the event bounds.
 */
import type { School } from "../types";
import { scheduleForDate } from "./schedule";
import { displayId } from "./roman";

const pad2 = (n: number) => n.toString().padStart(2, "0");

/** "2026-04-24" → "20260424" */
function ymdCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

/** Next-day compact YMD — the end boundary for an all-day event is exclusive. */
function nextDayCompact(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}`;
}

function location(s: School): string {
  return [s.address, s.postalCode, "Kraków"].filter(Boolean).join(", ");
}

function description(s: School, iso: string): string {
  const per = scheduleForDate(s.rawSchedule, iso);
  return [
    s.fullName,
    per,
    s.website ? `Strona szkoły: ${s.website}` : "",
    s.otouczelnieUrl ? `Profil otouczelnie: ${s.otouczelnieUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- Google Calendar template URL ----------------------------

export function googleCalendarUrl(s: School, iso: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Dzień Otwarty — ${displayId(s.id)}`,
    dates: `${ymdCompact(iso)}/${nextDayCompact(iso)}`,
    details: description(s, iso),
    location: location(s),
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

// ---------- .ics file ---------------------------------------------

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** "2026-04-24T11:02:03.000Z" → "20260424T110203Z" — ICS DTSTAMP format. */
function nowDtstamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

/** Minimal slug used inside UIDs. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildIcsFile(schools: School[]): { content: string; eventCount: number } {
  const dtstamp = nowDtstamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Krakowskie Licea//Dni Otwarte 2026//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Krakowskie Licea — Dni Otwarte",
    "X-WR-TIMEZONE:Europe/Warsaw",
  ];
  let count = 0;
  for (const s of schools) {
    for (const iso of s.openDays) {
      const uid = `${iso}-${slug(s.id) || "unknown"}@krakow-licea`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${ymdCompact(iso)}`,
        `DTEND;VALUE=DATE:${nextDayCompact(iso)}`,
        `SUMMARY:${icsEscape(`Dzień Otwarty — ${displayId(s.id)}`)}`,
        `LOCATION:${icsEscape(location(s))}`,
        `DESCRIPTION:${icsEscape(description(s, iso))}`,
        "END:VEVENT",
      );
      count++;
    }
  }
  lines.push("END:VCALENDAR");
  return { content: lines.join("\r\n"), eventCount: count };
}

// ---------- browser download ---------------------------------------

export function downloadIcs(content: string, filename = "krakowskie-licea-dni-otwarte.ics"): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

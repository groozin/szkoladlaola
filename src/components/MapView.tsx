import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { Landmark, School } from "../types";
import { formatDate, humanCountdown, nextUpcoming } from "../utils/dates";
import { displayId, markerLabel } from "../utils/roman";
import { classesLabel, thresholdRange } from "../utils/classes";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function buildPopupHTML(s: School, today: string): string {
  const upcoming = nextUpcoming(s.openDays, today);
  const variant = upcoming ? "upcoming" : s.openDays.length ? "past" : "unknown";
  const status = upcoming
    ? humanCountdown(upcoming, today)
    : s.openDays.length
      ? "wszystkie minęły"
      : "brak dni otwartych";
  const dates = s.openDays
    .map((d) => {
      const cls = d < today ? "school-popup-date past" : "school-popup-date";
      return `<li class="${cls}">${esc(formatDate(d))}</li>`;
    })
    .join("");

  const privateBadge = s.isPublic
    ? ""
    : `<span class="school-popup-badge">prywatna</span>`;

  const range = thresholdRange(s.classes);
  const statsBits: string[] = [];
  if (s.classes.length > 0) statsBits.push(esc(classesLabel(s.classes.length)));
  if (range) {
    const rangeStr =
      range.min === range.max
        ? range.min.toFixed(2)
        : `${range.min.toFixed(2)}–${range.max.toFixed(2)}`;
    statsBits.push(
      `próg ${esc(range.year.split("/")[0])}: <strong>${rangeStr}</strong> pkt`,
    );
  }
  const stats = statsBits.length
    ? `<div class="school-popup-stats">${statsBits.join(" · ")}</div>`
    : "";

  const addressLine = [s.district, s.address, s.postalCode]
    .filter(Boolean)
    .join(s.district ? " • " : ", ");

  return `
    <div class="school-popup school-popup--${variant}">
      <div class="school-popup-head">
        <span class="school-popup-id">${esc(displayId(s.id))}${privateBadge}</span>
        <span class="school-popup-next">${esc(status)}</span>
      </div>
      <div class="school-popup-name">${esc(s.fullName)}</div>
      <div class="school-popup-address">${esc(addressLine)}</div>
      ${stats}
      ${dates ? `<ul class="school-popup-dates">${dates}</ul>` : ""}
    </div>`;
}

type Props = {
  schools: School[];
  landmarks: Landmark[];
  selectedId: string | null;
  today: string;
  onMarkerClick: (id: string) => void;
};

const KRAKOW_CENTER: [number, number] = [19.94, 50.06];

type MarkerHandle = {
  marker: Marker;
  pill: HTMLDivElement;
  popup: maplibregl.Popup;
};

export function MapView({ schools, landmarks, selectedId, today, onMarkerClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<string, MarkerHandle>>(new Map());
  const clickHandlerRef = useRef(onMarkerClick);
  clickHandlerRef.current = onMarkerClick;

  // Init map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: KRAKOW_CENTER,
      zoom: 11.5,
      // Lock orientation — the map is north-up only. This disables right-click
      // drag rotation, two-finger touch rotation, and pitch gestures, so users
      // can't accidentally tilt the map and get lost.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Belt-and-braces: also kill rotation via the two-finger pinch gesture on touch.
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    // Keep the map sized correctly if the container changes (window resize,
    // sidebar toggle, devtools open, etc). Without this, markers can appear
    // offset after a layout change.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Sync markers with current schools & selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;
    const nextIds = new Set(schools.map((s) => s.id));

    for (const [id, h] of existing) {
      if (!nextIds.has(id)) {
        h.marker.remove();
        existing.delete(id);
      }
    }

    for (const s of schools) {
      const upcoming = nextUpcoming(s.openDays, today);
      const isSelected = s.id === selectedId;
      const status = upcoming
        ? "upcoming"
        : s.openDays.length === 0
          ? "unknown"
          : "past";
      const pillClass = [
        "school-marker-pill",
        status,
        isSelected && "selected",
        !s.isPublic && "private",
      ]
        .filter(Boolean)
        .join(" ");
      const tooltip = `${!s.isPublic ? "[prywatna] " : ""}${displayId(s.id)} — ${s.fullName}`;

      const handle = existing.get(s.id);
      if (handle) {
        handle.pill.className = pillClass;
        handle.pill.title = tooltip;
        handle.popup.setHTML(buildPopupHTML(s, today));
        continue;
      }

      // Outer element: positioned by MapLibre. MUST NOT have any CSS transform
      // applied, or it will fight MapLibre's inline transform during zoom/pan.
      const root = document.createElement("div");
      root.className = "school-marker-root";

      const pill = document.createElement("div");
      pill.className = pillClass;
      pill.title = tooltip;
      pill.textContent = markerLabel(s.id);
      // Don't stopPropagation — MapLibre's setPopup() attaches its own click
      // listener to the root element (the parent of the pill). If we stop the
      // event here it never bubbles up and the popup never toggles.
      pill.addEventListener("click", () => {
        clickHandlerRef.current(s.id);
      });
      root.appendChild(pill);

      const popup = new maplibregl.Popup({
        offset: 18,
        closeButton: false,
        closeOnClick: true,
        maxWidth: "260px",
      }).setHTML(buildPopupHTML(s, today));

      const marker = new maplibregl.Marker({ element: root, anchor: "center" })
        .setLngLat([s.lon, s.lat])
        .setPopup(popup)
        .addTo(map);
      existing.set(s.id, { marker, pill, popup });
    }
  }, [schools, selectedId, today]);

  // Landmarks (Mama / Tata etc.) — fixed blue pills, added once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = landmarks.map((l) => {
      const root = document.createElement("div");
      root.className = "school-marker-root";
      const pill = document.createElement("div");
      pill.className = "school-marker-pill landmark";
      pill.textContent = l.id;
      pill.title = `${l.id} — ${l.address}`;
      root.appendChild(pill);
      return new maplibregl.Marker({ element: root, anchor: "center" })
        .setLngLat([l.lon, l.lat])
        .addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [landmarks]);

  // Fly to selected school.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const school = schools.find((s) => s.id === selectedId);
    if (!school) return;
    map.easeTo({
      center: [school.lon, school.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 600,
    });
  }, [selectedId, schools]);

  return <div ref={containerRef} className="h-full flex-1" />;
}

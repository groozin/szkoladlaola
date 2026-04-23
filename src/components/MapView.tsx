import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { School } from "../types";
import { nextUpcoming } from "../utils/dates";
import { displayId, markerLabel } from "../utils/roman";

type Props = {
  schools: School[];
  selectedId: string | null;
  today: string;
  onMarkerClick: (id: string) => void;
};

const KRAKOW_CENTER: [number, number] = [19.94, 50.06];

type MarkerHandle = { marker: Marker; pill: HTMLDivElement };

export function MapView({ schools, selectedId, today, onMarkerClick }: Props) {
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
      const pillClass = `school-marker-pill ${upcoming ? "upcoming" : "past"}${
        isSelected ? " selected" : ""
      }`;
      const tooltip = `${displayId(s.id)} — ${s.fullName}`;

      const handle = existing.get(s.id);
      if (handle) {
        handle.pill.className = pillClass;
        handle.pill.title = tooltip;
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
      pill.addEventListener("click", (ev) => {
        ev.stopPropagation();
        clickHandlerRef.current(s.id);
      });
      root.appendChild(pill);

      const marker = new maplibregl.Marker({ element: root, anchor: "center" })
        .setLngLat([s.lon, s.lat])
        .addTo(map);
      existing.set(s.id, { marker, pill });
    }
  }, [schools, selectedId, today]);

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

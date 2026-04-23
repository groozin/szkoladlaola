/**
 * Address → { lat, lon } via Nominatim (OSM). Results are cached to
 * .cache/geocode.json so repeat runs don't re-hit the network.
 *
 * Nominatim policy: <= 1 req/sec, User-Agent header required.
 * See https://operations.osmfoundation.org/policies/nominatim/
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CACHE_PATH = resolve(__dirname, "..", ".cache", "geocode.json");
const UA = "krakow-schools-open-days/0.1 (https://example.invalid/ - personal tool)";

export type GeoResult = { lat: number; lon: number; displayName: string };

type Cache = Record<string, GeoResult | "NOT_FOUND">;

async function loadCache(): Promise<Cache> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8")) as Cache;
  } catch {
    return {};
  }
}

async function saveCache(cache: Cache) {
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function queryNominatim(q: string): Promise<GeoResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "pl");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}: ${await res.text()}`);
  const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!arr.length) return null;
  return { lat: Number(arr[0].lat), lon: Number(arr[0].lon), displayName: arr[0].display_name };
}

export async function geocodeAll(
  entries: Array<{ key: string; queries: string[] }>,
): Promise<Map<string, GeoResult | null>> {
  const cache = await loadCache();
  const out = new Map<string, GeoResult | null>();
  let hitNetwork = false;

  for (const { key, queries } of entries) {
    let result: GeoResult | null = null;

    for (const q of queries) {
      const hit = cache[q];
      if (hit === "NOT_FOUND") continue;
      if (hit) {
        result = hit;
        break;
      }

      // Not cached — hit the network. Rate-limit between calls.
      if (hitNetwork) await sleep(1100);
      hitNetwork = true;

      console.log(`  geocoding: ${q}`);
      try {
        const r = await queryNominatim(q);
        if (r) {
          cache[q] = r;
          result = r;
          break;
        } else {
          cache[q] = "NOT_FOUND";
        }
      } catch (err) {
        console.warn(`  ! error for "${q}":`, (err as Error).message);
        // Don't cache transient errors.
      }
    }

    out.set(key, result);
    // Persist after each school so partial progress survives interruptions.
    await saveCache(cache);
  }

  return out;
}

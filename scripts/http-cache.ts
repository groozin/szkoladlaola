/**
 * Polite cached HTTP GET. Hits the network at most once per URL; subsequent
 * calls read from .cache/. Rate-limited to 1 req/sec on cache misses.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CACHE_ROOT = resolve(__dirname, "..", ".cache");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) personal-tool " +
  "(krakow-schools, contact: personal use only)";

const MIN_GAP_MS = 1_100;
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** @param cacheKey  relative path under .cache/, e.g. "otouczelnie/index.html" */
export async function cachedGet(url: string, cacheKey: string): Promise<string> {
  const path = resolve(CACHE_ROOT, cacheKey);
  if (await exists(path)) return readFile(path, "utf8");

  const gap = Date.now() - lastRequestAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  lastRequestAt = Date.now();

  console.log(`  fetching: ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  const html = await res.text();

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html);
  return html;
}

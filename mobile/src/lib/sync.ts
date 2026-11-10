import { getLastSeq, pruneOldRecords, setLastSeq, upsertServerReadings, type ServerReading } from "./history-store";

/**
 * Keeps this device's local replica of the buoy history in step with D1, the source of
 * truth behind the 2lakes Worker API. The device only reads: nothing is ever written back.
 * The UI reads IndexedDB, never the network, so the app keeps working if Cloudflare is down.
 */

/** Public Worker address. It does not depend on the 2lakes.app domain. */
export const DEFAULT_API_BASE = "https://2lakes-api.brandon-pliska-86a.workers.dev";

export function getApiBase(): string {
  return (import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
}

const PAGE_LIMIT = 1000;
/** Safety stop: 50 pages of 1000 readings is far more than a normal catch-up. */
const MAX_PAGES = 50;
const REQUEST_TIMEOUT_MS = 15_000;
/** Do not sync more than once a minute from visibility changes and similar triggers. */
export const MIN_SYNC_INTERVAL_MS = 60_000;

export const LAST_SYNC_KEY = "2lakes-last-sync";

interface HistoryResponse {
  rows: ServerReading[];
  nextSeq: number;
  hasMore: boolean;
  /** Optional. When present and below our cursor, the server was rebuilt. */
  maxSeq?: number;
}

export type SyncResult =
  | { ok: true; changed: number; lastSeq: number; pages: number; reachedEnd: boolean }
  | { ok: false; error: string; changed: number; lastSeq: number };

function isReading(value: unknown): value is ServerReading {
  const r = value as Partial<ServerReading> | null;
  return (
    !!r &&
    typeof r.seq === "number" &&
    typeof r.buoyId === "string" &&
    typeof r.timestamp === "string" &&
    !Number.isNaN(Date.parse(r.timestamp))
  );
}

function parseHistory(body: unknown): HistoryResponse {
  const b = body as Partial<HistoryResponse> | null;
  if (!b || !Array.isArray(b.rows) || typeof b.nextSeq !== "number" || typeof b.hasMore !== "boolean") {
    throw new Error("unexpected response shape");
  }
  // Drop malformed rows rather than failing the whole sync.
  return {
    rows: b.rows.filter(isReading),
    nextSeq: b.nextSeq,
    hasMore: b.hasMore,
    maxSeq: typeof b.maxSeq === "number" ? b.maxSeq : undefined,
  };
}

async function fetchPage(base: string, afterSeq: number, fetchImpl: typeof fetch): Promise<HistoryResponse> {
  const res = await fetchImpl(`${base}/v1/history?afterSeq=${afterSeq}&limit=${PAGE_LIMIT}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return parseHistory(await res.json());
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * Pull everything new from D1 into the local replica. Safe to call from anywhere and as
 * often as you like: concurrent calls share one run, and a failure leaves local data as it was.
 * The cursor only advances after a page is safely stored, so an interrupted sync resumes.
 */
export function syncHistory(fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runSync(fetchImpl).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSync(fetchImpl: typeof fetch): Promise<SyncResult> {
  const base = getApiBase();
  let lastSeq = 0;
  let changed = 0;
  let pages = 0;

  try {
    lastSeq = await getLastSeq();
    let reachedEnd = false;

    while (pages < MAX_PAGES) {
      const page = await fetchPage(base, lastSeq, fetchImpl);
      pages++;

      // The server's counter is behind ours, so D1 was rebuilt or restored. Our cursor
      // would skip everything, so start over: D1 wins and re-sends what we need.
      if (page.maxSeq !== undefined && page.maxSeq < lastSeq) {
        lastSeq = 0;
        await setLastSeq(0);
        continue;
      }

      changed += await upsertServerReadings(page.rows);
      if (page.nextSeq > lastSeq) {
        lastSeq = page.nextSeq;
        await setLastSeq(lastSeq);
      }
      if (!page.hasMore) {
        reachedEnd = true;
        break;
      }
      if (page.rows.length === 0) break; // server says more but sent nothing: do not spin
    }

    await pruneOldRecords();
    if (typeof localStorage !== "undefined") localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    return { ok: true, changed, lastSeq, pages, reachedEnd };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), changed, lastSeq };
  }
}

/** When the last successful sync finished (epoch ms), or null if never. */
export function getLastSyncAt(): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LAST_SYNC_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Sync unless one finished within `MIN_SYNC_INTERVAL_MS`. For app-open and visibility triggers. */
export async function syncIfStale(now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<SyncResult | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const last = getLastSyncAt();
  if (last !== null && now - last < MIN_SYNC_INTERVAL_MS) return null;
  return syncHistory(fetchImpl);
}

/** Ask the browser to keep IndexedDB when storage is tight. Safe to call often; failures are fine. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

interface LatestResponse {
  rows: ServerReading[];
}

/** Newest reading per buoy from D1. Used to hydrate the replica before the UI reads IndexedDB. */
export async function fetchLatestFromWorker(fetchImpl: typeof fetch = fetch): Promise<ServerReading[]> {
  const res = await fetchImpl(`${getApiBase()}/v1/latest`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const body = (await res.json()) as Partial<LatestResponse>;
  if (!body || !Array.isArray(body.rows)) throw new Error("unexpected response shape");
  return body.rows.filter(isReading);
}

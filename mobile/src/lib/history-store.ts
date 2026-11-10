import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BuoyData, HistoryPoint } from "../types";

const DB_NAME = "2lakes-history";
const DB_VERSION = 2;
const STORE = "snapshots";
const META_STORE = "meta";
const LAST_SEQ_KEY = "lastSeq";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_KEY = "historyRetentionDays";
/** Days of readings kept on this device unless the user chooses otherwise. */
export const DEFAULT_RETENTION_DAYS = 365;
/** Choices offered in Settings. `null` means keep everything. */
export const RETENTION_CHOICES: readonly (number | null)[] = [30, 90, 365, null];

/**
 * A reading in this device's local replica. D1 (the Cloudflare Worker) is the source of
 * truth: rows with a `seq` came from it, and a later row from D1 always replaces ours.
 * Rows without a `seq` are provisional (read straight from King County, or imported).
 */
export interface SnapshotRecord {
  /** D1 ingest number. Absent on provisional rows that D1 has not confirmed. */
  seq?: number;
  buoyId: string;
  timestamp: string;
  recordedAt: string;
  tempC: number | null;
  tempF: number | null;
  airTempC: number | null;
  airTempF: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  humidity: number | null;
  dewpoint: number | null;
  precipitationProbability: number | null;
  lat?: number | null;
  lon?: number | null;
  updatedAt?: string;
}

/** A reading exactly as `GET /v1/history` returns it. */
export type ServerReading = Omit<SnapshotRecord, "seq"> & { seq: number };

interface HistoryDB extends DBSchema {
  snapshots: {
    key: number;
    value: SnapshotRecord;
    indexes: { "by-buoy": string; "by-buoy-timestamp": [string, string] };
  };
  meta: {
    key: string;
    value: number;
  };
}

let dbPromise: Promise<IDBPDatabase<HistoryDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<HistoryDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { autoIncrement: true });
          store.createIndex("by-buoy", "buoyId");
          store.createIndex("by-buoy-timestamp", ["buoyId", "timestamp"], { unique: true });
        }
        if (oldVersion < 2) {
          db.createObjectStore(META_STORE);
        }
      },
    });
  }
  return dbPromise;
}

/** Days of readings to keep, or `null` for everything. */
export function getRetentionDays(): number | null {
  if (typeof localStorage === "undefined") return DEFAULT_RETENTION_DAYS;
  const raw = localStorage.getItem(RETENTION_KEY);
  if (raw === null) return DEFAULT_RETENTION_DAYS;
  if (raw === "forever") return null;
  const days = parseInt(raw, 10);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
}

export function setRetentionDays(days: number | null): void {
  localStorage.setItem(RETENTION_KEY, days === null ? "forever" : String(days));
}

/** Oldest reading time (epoch ms) this device keeps, or `null` when keeping everything. */
function retentionCutoff(now = Date.now()): number | null {
  const days = getRetentionDays();
  return days === null ? null : now - days * DAY_MS;
}

/** The highest D1 `seq` this device has already stored. */
export async function getLastSeq(): Promise<number> {
  const db = await getDb();
  return (await db.get(META_STORE, LAST_SEQ_KEY)) ?? 0;
}

export async function setLastSeq(seq: number): Promise<void> {
  const db = await getDb();
  await db.put(META_STORE, seq, LAST_SEQ_KEY);
}

/**
 * Store readings from D1. D1 wins: a reading we already hold under the same
 * (buoyId, timestamp) is overwritten, whatever it held before. Readings older than the
 * retention window are skipped, but the caller can still advance its `lastSeq` past them.
 * Returns how many readings were added or changed.
 */
export async function upsertServerReadings(rows: ServerReading[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cutoff = retentionCutoff();
  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  const index = tx.store.index("by-buoy-timestamp");
  let changed = 0;

  for (const row of rows) {
    const time = Date.parse(row.timestamp);
    if (Number.isNaN(time)) continue;
    if (cutoff !== null && time < cutoff) continue;

    // The store keeps its key outside the value, so look the key up to replace in place.
    const key = await index.getKey([row.buoyId, row.timestamp]);
    if (key !== undefined) {
      const existing = await tx.store.get(key);
      if (existing && existing.seq === row.seq && existing.updatedAt === row.updatedAt) continue;
      await tx.store.put({ ...row }, key);
    } else {
      await tx.store.add({ ...row });
    }
    changed++;
  }
  await tx.done;
  return changed;
}

/** Save a reading that D1 has not confirmed. Never overwrites a row we already hold. */
export async function saveSnapshot(buoyId: string, data: BuoyData): Promise<void> {
  if (!data.timestamp) return;

  const normalizedTimestamp = new Date(data.timestamp).toISOString();
  const db = await getDb();

  const existing = await db.getFromIndex(STORE, "by-buoy-timestamp", [buoyId, normalizedTimestamp]);
  if (existing) return;

  await db.add(STORE, {
    buoyId,
    timestamp: normalizedTimestamp,
    recordedAt: new Date().toISOString(),
    tempC: data.tempC ?? null,
    tempF: data.tempF ?? null,
    airTempC: data.airTempC ?? null,
    airTempF: data.airTempF ?? null,
    windSpeed: data.windSpeed ?? null,
    precipitation: data.precipitation ?? null,
    humidity: data.humidity != null && !isNaN(data.humidity) ? data.humidity : null,
    dewpoint: data.dewpoint ?? null,
    precipitationProbability: data.precipitationProbability ?? null,
  });

  await pruneOldRecords(buoyId);
}

export async function loadHistory(buoyId: string): Promise<HistoryPoint[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE, "by-buoy", buoyId);

  return rows
    .map((d) => ({
      time: d.timestamp,
      tempC: d.tempC ?? 0,
      tempF: d.tempF ?? 0,
      airTempC: d.airTempC ?? undefined,
      airTempF: d.airTempF ?? undefined,
      windSpeed: d.windSpeed ?? undefined,
      precipitation: d.precipitation ?? undefined,
      humidity: d.humidity ?? undefined,
      dewpoint: d.dewpoint ?? undefined,
      dewpointF: d.dewpoint != null ? d.dewpoint * 9 / 5 + 32 : null,
      precipitationProbability: d.precipitationProbability ?? undefined,
    }))
    .filter((p) => p.time && !isNaN(new Date(p.time).getTime()))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

/** Newest reading for one buoy in this device's replica, or null. */
export async function getLatestReading(buoyId: string): Promise<SnapshotRecord | null> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE, "by-buoy", buoyId);
  let best: SnapshotRecord | null = null;
  let bestMs = -Infinity;
  for (const row of rows) {
    const ms = Date.parse(row.timestamp);
    if (Number.isNaN(ms)) continue;
    if (ms >= bestMs) {
      best = row;
      bestMs = ms;
    }
  }
  return best;
}

/** Newest reading per buoyId currently stored on this device. */
export async function getLatestReadings(): Promise<SnapshotRecord[]> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  const byBuoy = new Map<string, SnapshotRecord>();
  for (const row of all) {
    const ms = Date.parse(row.timestamp);
    if (Number.isNaN(ms)) continue;
    const prev = byBuoy.get(row.buoyId);
    if (!prev || ms >= Date.parse(prev.timestamp)) byBuoy.set(row.buoyId, row);
  }
  return Array.from(byBuoy.values());
}

/** Delete readings older than the retention window, for one buoy or all of them. */
export async function pruneOldRecords(buoyId?: string): Promise<number> {
  const cutoff = retentionCutoff();
  if (cutoff === null) return 0;

  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  let cursor = buoyId ? await tx.store.index("by-buoy").openCursor(buoyId) : await tx.store.openCursor();
  let removed = 0;

  while (cursor) {
    if (new Date(cursor.value.timestamp).getTime() < cutoff) {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

export const EXPORT_FORMAT = "2lakes-history";
export const EXPORT_VERSION = 1;

export interface HistoryExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  lastSeq: number;
  rows: SnapshotRecord[];
}

/** Everything on this device, as a plain object the user can save as a JSON file. */
export async function exportHistory(): Promise<HistoryExport> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    lastSeq: await getLastSeq(),
    rows: all,
  };
}

/**
 * Merge an exported file into this device. It only adds readings we do not already hold,
 * so importing can never overwrite what D1 gave us. It does not touch `lastSeq`: the next
 * sync still pulls from D1 and replaces any imported row D1 knows about.
 * Throws if the file is not a 2lakes export.
 */
export async function importHistory(data: unknown): Promise<{ added: number; skipped: number }> {
  const file = data as Partial<HistoryExport> | null;
  if (!file || file.format !== EXPORT_FORMAT || !Array.isArray(file.rows)) {
    throw new Error("This is not a 2 Lakes history file.");
  }
  if (typeof file.version !== "number" || file.version > EXPORT_VERSION) {
    throw new Error("This history file was made by a newer version of the app.");
  }

  const cutoff = retentionCutoff();
  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  const index = tx.store.index("by-buoy-timestamp");
  let added = 0;
  let skipped = 0;

  for (const raw of file.rows) {
    const row = raw as Partial<SnapshotRecord>;
    const time = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (typeof row.buoyId !== "string" || Number.isNaN(time) || (cutoff !== null && time < cutoff)) {
      skipped++;
      continue;
    }
    if (await index.get([row.buoyId, row.timestamp as string])) {
      skipped++;
      continue;
    }
    await tx.store.add({
      buoyId: row.buoyId,
      timestamp: new Date(time).toISOString(),
      recordedAt: typeof row.recordedAt === "string" ? row.recordedAt : new Date().toISOString(),
      tempC: row.tempC ?? null,
      tempF: row.tempF ?? null,
      airTempC: row.airTempC ?? null,
      airTempF: row.airTempF ?? null,
      windSpeed: row.windSpeed ?? null,
      precipitation: row.precipitation ?? null,
      humidity: row.humidity ?? null,
      dewpoint: row.dewpoint ?? null,
      precipitationProbability: row.precipitationProbability ?? null,
      lat: row.lat ?? null,
      lon: row.lon ?? null,
      // Imported rows are never marked as confirmed by D1: no `seq`.
    });
    added++;
  }
  await tx.done;
  return { added, skipped };
}

/** Test helper — closes open connections and wipes the history database. */
export async function resetHistoryStoreForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

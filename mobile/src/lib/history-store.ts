import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BuoyData, HistoryPoint } from "../types";

const DB_NAME = "2lakes-history";
const DB_VERSION = 1;
const STORE = "snapshots";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface SnapshotRecord {
  id?: number;
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
}

interface HistoryDB extends DBSchema {
  snapshots: {
    key: number;
    value: SnapshotRecord;
    indexes: { "by-buoy": string; "by-buoy-timestamp": [string, string] };
  };
}

let dbPromise: Promise<IDBPDatabase<HistoryDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<HistoryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex("by-buoy", "buoyId");
        store.createIndex("by-buoy-timestamp", ["buoyId", "timestamp"], { unique: true });
      },
    });
  }
  return dbPromise;
}

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

async function pruneOldRecords(buoyId: string) {
  const cutoff = Date.now() - RETENTION_MS;
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE, "by-buoy", buoyId);
  const tx = db.transaction(STORE, "readwrite");

  for (const row of rows) {
    if (new Date(row.timestamp).getTime() < cutoff && row.id != null) {
      await tx.store.delete(row.id);
    }
  }
  await tx.done;
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

import { recordFailure, recordSuccess, upsertReadings } from "./db";
import { readingsFromFeed, type Reading } from "./feed";
import { fetchPrecipitationProbability } from "./nws";

export interface CollectEnv {
  DB: D1Database;
  KC_FEED_URL?: string;
}

export const DEFAULT_KC_FEED_URL = "https://green2.kingcounty.gov/lake-buoy/GenerateMapData.aspx";
const KC_TIMEOUT_MS = 15000;
const KC_USER_AGENT = "2lakes.app collector (https://github.com/alienfacepalm/2lakes.app)";

export interface CollectResult {
  source: string;
  readings: number;
  changed: number;
  newest: string | null;
}

/** Fill in the one NWS-derived field. Failures leave it null and never block the write. */
async function addPrecipitationProbability(db: D1Database, readings: Reading[]): Promise<void> {
  const now = new Date().toISOString();
  let failed = 0;
  await Promise.all(
    readings.map(async (r) => {
      if (r.lat == null || r.lon == null) return;
      const value = await fetchPrecipitationProbability(r.lat, r.lon);
      if (value === null) failed += 1;
      r.precipitationProbability = value;
    })
  );
  if (failed === 0) await recordSuccess(db, "nws", now, null, readings.length);
  else await recordFailure(db, "nws", now, `${failed} of ${readings.length} lookups failed`);
}

/** Parse feed text, enrich it, and upsert it. Shared by the cron and POST /ingest. */
export async function ingestFeed(
  env: CollectEnv,
  feedText: string,
  source: "kingcounty" | "ingest"
): Promise<CollectResult> {
  const now = new Date().toISOString();
  try {
    const readings = readingsFromFeed(feedText);
    if (readings.length === 0) throw new Error("feed had no usable readings");

    await addPrecipitationProbability(env.DB, readings);
    const changed = await upsertReadings(env.DB, readings, now);
    const newest = readings.map((r) => r.timestamp).sort().at(-1) ?? null;
    await recordSuccess(env.DB, source, now, newest, changed);
    return { source, readings: readings.length, changed, newest };
  } catch (error) {
    await recordFailure(env.DB, source, now, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** Cron entry point: fetch King County directly. */
export async function runCollector(env: CollectEnv): Promise<CollectResult> {
  const now = new Date().toISOString();
  let text: string;
  try {
    const res = await fetch(env.KC_FEED_URL ?? DEFAULT_KC_FEED_URL, {
      headers: { "User-Agent": KC_USER_AGENT },
      signal: AbortSignal.timeout(KC_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`King County responded ${res.status}`);
    text = await res.text();
  } catch (error) {
    await recordFailure(env.DB, "kingcounty", now, error instanceof Error ? error.message : String(error));
    throw error;
  }
  return ingestFeed(env, text, "kingcounty");
}

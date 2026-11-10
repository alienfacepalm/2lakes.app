import type { Reading } from "./feed";

const NEXT_SEQ = "(SELECT COALESCE(MAX(seq), 0) + 1 FROM snapshots)";

/**
 * Insert a reading, or update it only if something actually changed.
 *
 * - A new row gets the next `seq`.
 * - An existing row is rewritten (and moved to the next `seq`) only when a King County
 *   field differs, or when it had no precipitation probability and now has one. Fetching
 *   the same reading again changes nothing, so devices never re-download it.
 * - `precipitationProbability` keeps its first value, so it does not churn every 15 minutes.
 */
const UPSERT_SQL = `
INSERT INTO snapshots
  (seq, buoyId, timestamp, recordedAt, tempC, tempF, airTempC, airTempF, windSpeed,
   precipitation, humidity, dewpoint, precipitationProbability, lat, lon, updatedAt)
VALUES
  (${NEXT_SEQ}, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?3)
ON CONFLICT (buoyId, timestamp) DO UPDATE SET
  tempC = excluded.tempC,
  tempF = excluded.tempF,
  airTempC = excluded.airTempC,
  airTempF = excluded.airTempF,
  windSpeed = excluded.windSpeed,
  precipitation = excluded.precipitation,
  humidity = excluded.humidity,
  dewpoint = excluded.dewpoint,
  precipitationProbability = COALESCE(snapshots.precipitationProbability, excluded.precipitationProbability),
  lat = excluded.lat,
  lon = excluded.lon,
  seq = ${NEXT_SEQ},
  updatedAt = excluded.updatedAt
WHERE snapshots.tempC IS NOT excluded.tempC
   OR snapshots.tempF IS NOT excluded.tempF
   OR snapshots.airTempC IS NOT excluded.airTempC
   OR snapshots.airTempF IS NOT excluded.airTempF
   OR snapshots.windSpeed IS NOT excluded.windSpeed
   OR snapshots.precipitation IS NOT excluded.precipitation
   OR snapshots.humidity IS NOT excluded.humidity
   OR snapshots.dewpoint IS NOT excluded.dewpoint
   OR snapshots.lat IS NOT excluded.lat
   OR snapshots.lon IS NOT excluded.lon
   OR (snapshots.precipitationProbability IS NULL AND excluded.precipitationProbability IS NOT NULL)
`;

/** Upsert readings in one batch. Returns how many rows were inserted or changed. */
export async function upsertReadings(
  db: D1Database,
  readings: Reading[],
  nowIso: string
): Promise<number> {
  if (readings.length === 0) return 0;
  const stmt = db.prepare(UPSERT_SQL);
  const results = await db.batch(
    readings.map((r) =>
      stmt.bind(
        r.buoyId,
        r.timestamp,
        nowIso,
        r.tempC,
        r.tempF,
        r.airTempC,
        r.airTempF,
        r.windSpeed,
        r.precipitation,
        r.humidity,
        r.dewpoint,
        r.precipitationProbability,
        r.lat,
        r.lon
      )
    )
  );
  return results.reduce((sum, res) => sum + (res.meta.changes ?? 0), 0);
}

export async function recordSuccess(
  db: D1Database,
  source: string,
  nowIso: string,
  lastTimestamp: string | null,
  changed: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sync_state (source, lastAttemptAt, lastSuccessAt, lastError, lastTimestamp, lastChanged)
       VALUES (?1, ?2, ?2, NULL, ?3, ?4)
       ON CONFLICT (source) DO UPDATE SET
         lastAttemptAt = ?2, lastSuccessAt = ?2, lastError = NULL,
         lastTimestamp = COALESCE(?3, sync_state.lastTimestamp), lastChanged = ?4`
    )
    .bind(source, nowIso, lastTimestamp, changed)
    .run();
}

export async function recordFailure(
  db: D1Database,
  source: string,
  nowIso: string,
  error: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sync_state (source, lastAttemptAt, lastError) VALUES (?1, ?2, ?3)
       ON CONFLICT (source) DO UPDATE SET lastAttemptAt = ?2, lastError = ?3`
    )
    .bind(source, nowIso, error.slice(0, 500))
    .run();
}

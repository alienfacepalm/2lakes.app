-- Denormalized read models so /v1/latest and /v1/status stay cheap as snapshots grow.
-- Collect refreshes these after every upsert. Baseline loads should re-run the backfill
-- at the bottom (or call the same refresh helpers) after bulk insert.

CREATE TABLE latest (
  buoyId TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  recordedAt TEXT NOT NULL,
  tempC REAL,
  tempF REAL,
  airTempC REAL,
  airTempF REAL,
  windSpeed REAL,
  precipitation REAL,
  humidity REAL,
  dewpoint REAL,
  precipitationProbability REAL,
  lat REAL,
  lon REAL,
  updatedAt TEXT NOT NULL,
  rowCount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  maxSeq INTEGER NOT NULL DEFAULT 0,
  rowCount INTEGER NOT NULL DEFAULT 0
);

INSERT INTO stats (id, maxSeq, rowCount) VALUES (1, 0, 0);

-- Backfill from whatever is already in snapshots (collector rows today; baseline later).
INSERT INTO latest (
  buoyId, seq, timestamp, recordedAt, tempC, tempF, airTempC, airTempF,
  windSpeed, precipitation, humidity, dewpoint, precipitationProbability, lat, lon, updatedAt, rowCount
)
SELECT
  s.buoyId, s.seq, s.timestamp, s.recordedAt, s.tempC, s.tempF, s.airTempC, s.airTempF,
  s.windSpeed, s.precipitation, s.humidity, s.dewpoint, s.precipitationProbability, s.lat, s.lon, s.updatedAt,
  (SELECT COUNT(*) FROM snapshots c WHERE c.buoyId = s.buoyId)
FROM snapshots s
JOIN (
  SELECT buoyId, MAX(timestamp) AS ts FROM snapshots GROUP BY buoyId
) m ON s.buoyId = m.buoyId AND s.timestamp = m.ts;

UPDATE stats SET
  maxSeq = (SELECT COALESCE(MAX(seq), 0) FROM snapshots),
  rowCount = (SELECT COUNT(*) FROM snapshots)
WHERE id = 1;

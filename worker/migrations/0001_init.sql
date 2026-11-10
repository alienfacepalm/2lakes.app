-- D1 is the source of truth for all 2lakes buoy readings.
--
-- `seq` is a rising ingest number. A new row gets MAX(seq)+1, and any later change to
-- a row (a correction, or a late NWS fill) moves it to a new MAX(seq)+1. Devices sync
-- with `seq > lastSeq`, so they pick up inserts and updates and never miss backfills.
-- Do not make `seq` AUTOINCREMENT: updates assign it manually and would collide with
-- the sqlite_sequence counter.
--
-- `timestamp` is the canonical UTC reading time as ISO 8601 with milliseconds, for
-- example 2026-11-09T23:02:00.000Z. King County's own clock is a fixed UTC-8 (no
-- daylight saving), so UTC = King County label + 8 hours. See src/time.ts.
CREATE TABLE snapshots (
  seq INTEGER PRIMARY KEY,
  buoyId TEXT NOT NULL,
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
  UNIQUE (buoyId, timestamp)
);

CREATE INDEX idx_snapshots_buoy_seq ON snapshots (buoyId, seq);

-- One row per data source: how the last runs went.
CREATE TABLE sync_state (
  source TEXT PRIMARY KEY,
  lastAttemptAt TEXT,
  lastSuccessAt TEXT,
  lastError TEXT,
  lastTimestamp TEXT,
  lastChanged INTEGER
);

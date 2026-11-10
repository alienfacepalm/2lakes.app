#!/usr/bin/env node
/**
 * One-time export of the legacy Firestore `buoy_snapshots` collection to NDJSON.
 *
 * The Firestore project belongs to the retired Google AI Studio app. This script
 * reads it through the public REST API with the client apiKey from
 * `firebase-applet-config.json` (a public client key, not a secret) and writes
 * plain JSON, one document per line, to `worker/.data/buoy_snapshots.ndjson`.
 * That folder is git-ignored. The file is the baseline loaded into D1 later.
 *
 * The free tier allows about 50k document reads a day, and this database cannot go
 * over it. The script therefore appends each page as it arrives and saves a cursor in
 * `worker/.data/export-cursor.json`. If the quota runs out (HTTP 429) it stops cleanly,
 * and the next run resumes from the cursor. The quota resets at midnight Pacific time.
 * Delete both files in `worker/.data/` to start over.
 *
 * Usage (from the repo root):  node worker/scripts/export-firestore.mjs
 */
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const configPath = resolve(repoRoot, "firebase-applet-config.json");
const dataDir = resolve(repoRoot, "worker", ".data");
const outPath = resolve(dataDir, "buoy_snapshots.ndjson");
const cursorPath = resolve(dataDir, "export-cursor.json");
const COLLECTION = "buoy_snapshots";
const PAGE_SIZE = 500;

/** Convert a Firestore REST typed value into a plain JS value. */
function fromValue(v) {
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields ?? {});
  return null;
}

function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
}

const config = JSON.parse(await readFile(configPath, "utf8"));
// The deployed rules reject the plain "list documents" endpoint, but allow queries,
// so page with runQuery ordered by recordedAt (always ISO) then document name.
const queryUrl =
  `https://firestore.googleapis.com/v1/projects/${config.projectId}` +
  `/databases/${config.firestoreDatabaseId}/documents:runQuery?key=${config.apiKey}`;

await mkdir(dataDir, { recursive: true });

// Resume only when both files exist, so they cannot disagree.
let cursor = null;
let exported = 0;
if (existsSync(cursorPath) && existsSync(outPath)) {
  ({ cursor, exported } = JSON.parse(await readFile(cursorPath, "utf8")));
  console.log(`resuming after ${exported} documents already saved`);
} else {
  await rm(outPath, { force: true });
  await rm(cursorPath, { force: true });
}

let pages = 0;
let complete = false;
let stoppedByQuota = false;
for (;;) {
  const structuredQuery = {
    from: [{ collectionId: COLLECTION }],
    orderBy: [
      { field: { fieldPath: "recordedAt" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
    ],
    limit: PAGE_SIZE,
  };
  if (cursor) structuredQuery.startAt = { values: cursor, before: false };

  const res = await fetch(queryUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  });
  if (res.status === 429) {
    stoppedByQuota = true;
    break;
  }
  if (!res.ok) {
    throw new Error(`Firestore query failed: HTTP ${res.status} ${await res.text()}`);
  }
  const results = (await res.json()).filter((r) => r.document);
  if (results.length > 0) {
    const lines = results.map(({ document: doc }) =>
      JSON.stringify({ id: doc.name.split("/").pop(), ...fromFields(doc.fields ?? {}) })
    );
    await appendFile(outPath, lines.join("\n") + "\n", "utf8");
    exported += results.length;
    const last = results.at(-1).document;
    cursor = [last.fields.recordedAt, { referenceValue: last.name }];
    await writeFile(cursorPath, JSON.stringify({ cursor, exported }), "utf8");
  }
  pages += 1;
  process.stdout.write(`\rpage ${pages}: ${exported} documents saved`);
  if (results.length < PAGE_SIZE) {
    complete = true;
    break;
  }
}
process.stdout.write("\n");

if (stoppedByQuota) {
  console.log(
    `STOPPED: Firestore free daily read quota is used up. ${exported} documents are saved.\n` +
      "Run this script again after midnight Pacific time to resume."
  );
  process.exit(2);
}

if (complete) {
  await writeFile(
    cursorPath,
    JSON.stringify({ cursor, exported, complete: true }),
    "utf8"
  );
}

const rows = (await readFile(outPath, "utf8"))
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const LOCAL = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/;
const formats = { iso: 0, kingCountyLocal: 0, other: 0 };
const buoys = new Map();
for (const r of rows) {
  buoys.set(r.buoyId, (buoys.get(r.buoyId) ?? 0) + 1);
  if (ISO.test(r.timestamp)) formats.iso += 1;
  else if (LOCAL.test(r.timestamp)) formats.kingCountyLocal += 1;
  else formats.other += 1;
}
const keys = new Set(rows.map((r) => `${r.buoyId}|${r.timestamp}`));

console.log(`export complete: ${rows.length} rows in ${outPath}`);
console.log(`first recordedAt: ${rows[0]?.recordedAt}`);
console.log(`last recordedAt:  ${rows.at(-1)?.recordedAt}`);
console.log(`distinct raw (buoyId, timestamp) keys: ${keys.size} (exact duplicates: ${rows.length - keys.size})`);
console.log("timestamp formats:", formats);
console.log("rows per buoy:", Object.fromEntries(buoys));

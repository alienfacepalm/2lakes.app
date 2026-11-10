import { describe, it, expect, beforeEach } from "vitest";
import {
  exportHistory,
  getLastSeq,
  importHistory,
  loadHistory,
  pruneOldRecords,
  resetHistoryStoreForTests,
  saveSnapshot,
  setLastSeq,
  setRetentionDays,
  type ServerReading,
} from "./history-store";
import { syncHistory, syncIfStale, LAST_SYNC_KEY, MIN_SYNC_INTERVAL_MS } from "./sync";
import type { BuoyData } from "../types";

const BUOY = "Lake Sammamish";

/** An hour-aligned timestamp `hoursAgo` hours before now, so retention never interferes. */
function ts(hoursAgo: number): string {
  const base = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return new Date(base - hoursAgo * 3_600_000).toISOString();
}

function reading(seq: number, hoursAgo: number, tempC: number | null = 18, buoyId = BUOY): ServerReading {
  return {
    seq,
    buoyId,
    timestamp: ts(hoursAgo),
    recordedAt: ts(hoursAgo),
    tempC,
    tempF: tempC === null ? null : Math.round((tempC * 9) / 5 + 32),
    airTempC: 20,
    airTempF: 68,
    windSpeed: 3,
    precipitation: null,
    humidity: 50,
    dewpoint: 10,
    precipitationProbability: 10,
    lat: 47.6,
    lon: -122.1,
    updatedAt: ts(hoursAgo),
  };
}

/** A fake Worker holding `rows`, answering /v1/history like the real one. */
function fakeApi(rows: ServerReading[], opts: { pageSize?: number; maxSeq?: number } = {}) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.search);
    const afterSeq = Number(url.searchParams.get("afterSeq") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), opts.pageSize ?? 1000);
    const matching = rows.filter((r) => r.seq > afterSeq).sort((a, b) => a.seq - b.seq);
    const page = matching.slice(0, limit);
    const body = {
      rows: page,
      nextSeq: page.length ? page[page.length - 1]!.seq : afterSeq,
      hasMore: matching.length > limit,
      ...(opts.maxSeq !== undefined ? { maxSeq: opts.maxSeq } : {}),
    };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

function sampleBuoy(timestamp: string): BuoyData {
  return {
    location: "Lake Sammamish Buoy",
    tempC: 99,
    tempF: 210,
    airTempC: 1,
    airTempF: 34,
    windSpeed: 1,
    precipitation: null,
    humidity: 1,
    dewpoint: 1,
    precipitationProbability: 0,
    timestamp,
    status: "ACTIVE",
    condition: "Moderate",
    lastSync: new Date().toISOString(),
    lat: 47.58,
    lon: -122.09,
  };
}

describe("sync", () => {
  beforeEach(async () => {
    await resetHistoryStoreForTests();
    localStorage.clear();
  });

  it("pulls every page and advances the cursor", async () => {
    const api = fakeApi([reading(1, 5), reading(2, 4), reading(3, 3), reading(4, 2), reading(5, 1)], { pageSize: 2 });
    const result = await syncHistory(api.impl);

    expect(result).toMatchObject({ ok: true, changed: 5, lastSeq: 5, pages: 3, reachedEnd: true });
    expect(await getLastSeq()).toBe(5);
    expect(await loadHistory(BUOY)).toHaveLength(5);
  });

  it("asks only for rows after the saved cursor", async () => {
    const api = fakeApi([reading(1, 3), reading(2, 2)]);
    await syncHistory(api.impl);
    api.calls.length = 0;

    const again = await syncHistory(api.impl);
    expect(again).toMatchObject({ ok: true, changed: 0, lastSeq: 2 });
    expect(api.calls).toEqual(["?afterSeq=2&limit=1000"]);
  });

  it("D1 wins: a corrected reading replaces the local copy", async () => {
    await syncHistory(fakeApi([reading(1, 2, 18)]).impl);
    expect((await loadHistory(BUOY))[0]?.tempC).toBe(18);

    const corrected = { ...reading(2, 2, 21), updatedAt: new Date().toISOString() };
    await syncHistory(fakeApi([corrected]).impl);

    const history = await loadHistory(BUOY);
    expect(history).toHaveLength(1);
    expect(history[0]?.tempC).toBe(21);
  });

  it("D1 wins over a provisional reading read directly from King County", async () => {
    await saveSnapshot(BUOY, sampleBuoy(ts(2)));
    expect((await loadHistory(BUOY))[0]?.tempC).toBe(99);

    await syncHistory(fakeApi([reading(1, 2, 18)]).impl);

    const history = await loadHistory(BUOY);
    expect(history).toHaveLength(1);
    expect(history[0]?.tempC).toBe(18);
  });

  it("keeps the cursor from the pages that finished when a later page fails", async () => {
    const rows = [reading(1, 4), reading(2, 3), reading(3, 2), reading(4, 1)];
    const good = fakeApi(rows, { pageSize: 2 });
    let n = 0;
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      n++;
      if (n === 2) return new Response("boom", { status: 500 });
      return good.impl(input, init);
    }) as typeof fetch;

    const failed = await syncHistory(flaky);
    expect(failed).toMatchObject({ ok: false, changed: 2, lastSeq: 2 });
    expect(await getLastSeq()).toBe(2);

    const resumed = await syncHistory(good.impl);
    expect(resumed).toMatchObject({ ok: true, changed: 2, lastSeq: 4 });
    expect(await loadHistory(BUOY)).toHaveLength(4);
  });

  it("keeps local data and does not throw when the API is unreachable", async () => {
    await syncHistory(fakeApi([reading(1, 2)]).impl);
    const down = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    const result = await syncHistory(down);
    expect(result).toMatchObject({ ok: false, lastSeq: 1 });
    expect(await loadHistory(BUOY)).toHaveLength(1);
  });

  it("rejects an unexpected response without touching local data", async () => {
    const bad = (async () => new Response(JSON.stringify({ hello: "world" }), { status: 200 })) as typeof fetch;
    const result = await syncHistory(bad);
    expect(result.ok).toBe(false);
    expect(await getLastSeq()).toBe(0);
  });

  it("starts over when the server's counter is behind ours (D1 was rebuilt)", async () => {
    await setLastSeq(500);
    const api = fakeApi([reading(1, 2), reading(2, 1)], { maxSeq: 2 });

    const result = await syncHistory(api.impl);

    expect(result).toMatchObject({ ok: true, lastSeq: 2 });
    expect(await loadHistory(BUOY)).toHaveLength(2);
  });

  it("shares one run between concurrent callers", async () => {
    const api = fakeApi([reading(1, 1)]);
    const [a, b] = await Promise.all([syncHistory(api.impl), syncHistory(api.impl)]);
    expect(a).toBe(b);
    expect(api.calls).toHaveLength(1);
  });

  it("skips rows older than the retention window but still advances the cursor", async () => {
    setRetentionDays(30);
    const result = await syncHistory(fakeApi([reading(1, 24 * 60), reading(2, 2)]).impl);

    expect(result).toMatchObject({ ok: true, changed: 1, lastSeq: 2 });
    expect(await loadHistory(BUOY)).toHaveLength(1);
  });

  it("syncIfStale does nothing right after a successful sync", async () => {
    const api = fakeApi([reading(1, 1)]);
    await syncHistory(api.impl);
    api.calls.length = 0;

    expect(await syncIfStale(Date.now(), api.impl)).toBeNull();
    expect(api.calls).toHaveLength(0);

    localStorage.setItem(LAST_SYNC_KEY, String(Date.now() - MIN_SYNC_INTERVAL_MS - 1));
    expect(await syncIfStale(Date.now(), api.impl)).toMatchObject({ ok: true });
  });
});

describe("export and import", () => {
  beforeEach(async () => {
    await resetHistoryStoreForTests();
    localStorage.clear();
  });

  it("round-trips through a JSON file", async () => {
    await syncHistory(fakeApi([reading(1, 3), reading(2, 2)]).impl);
    const file = JSON.parse(JSON.stringify(await exportHistory()));
    expect(file.rows).toHaveLength(2);
    expect(file.lastSeq).toBe(2);

    await resetHistoryStoreForTests();
    expect(await importHistory(file)).toEqual({ added: 2, skipped: 0 });
    expect(await loadHistory(BUOY)).toHaveLength(2);
  });

  it("never overwrites a reading we already hold, and does not move the cursor", async () => {
    await syncHistory(fakeApi([reading(1, 2, 18)]).impl);
    const file = JSON.parse(JSON.stringify(await exportHistory()));
    file.rows[0].tempC = 50;
    file.rows.push({ ...file.rows[0], timestamp: ts(5), tempC: 17 });

    expect(await importHistory(file)).toEqual({ added: 1, skipped: 1 });
    const history = await loadHistory(BUOY);
    expect(history).toHaveLength(2);
    expect(history.find((p) => p.time === ts(2))?.tempC).toBe(18);
    expect(await getLastSeq()).toBe(1);
  });

  it("imported rows are replaced by D1 on the next sync", async () => {
    const file = {
      format: "2lakes-history",
      version: 1,
      exportedAt: new Date().toISOString(),
      lastSeq: 0,
      rows: [{ ...reading(0, 2, 40), seq: undefined }],
    };
    await importHistory(JSON.parse(JSON.stringify(file)));
    expect((await loadHistory(BUOY))[0]?.tempC).toBe(40);

    await syncHistory(fakeApi([reading(1, 2, 18)]).impl);
    expect((await loadHistory(BUOY))[0]?.tempC).toBe(18);
  });

  it("pruning deletes readings older than the retention window and keeps the rest", async () => {
    setRetentionDays(null); // keep everything while loading
    await syncHistory(fakeApi([reading(1, 24 * 60), reading(2, 24 * 40), reading(3, 2)]).impl);
    expect(await loadHistory(BUOY)).toHaveLength(3);

    setRetentionDays(30);
    expect(await pruneOldRecords()).toBe(2);
    const left = await loadHistory(BUOY);
    expect(left).toHaveLength(1);
    expect(left[0]?.time).toBe(ts(2));
  });

  it("rejects files that are not 2lakes exports", async () => {
    await expect(importHistory({ hello: "world" })).rejects.toThrow(/not a 2 Lakes history file/);
    await expect(importHistory(null)).rejects.toThrow();
    await expect(
      importHistory({ format: "2lakes-history", version: 99, rows: [] })
    ).rejects.toThrow(/newer version/);
  });
});

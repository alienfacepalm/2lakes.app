import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuoyData } from "../types";
import {
  SAMPLE_KC_RESPONSE,
  SAMPLE_NWS_ALERTS,
  SAMPLE_NWS_DAILY,
  SAMPLE_NWS_HOURLY,
  SAMPLE_NWS_POINT,
} from "../test/fixtures/king-county";
import {
  getAllBuoys,
  getBuoyData,
  getKingCountyUrl,
  KC_DIRECT_URL,
  resetBuoyApiForTests,
} from "./buoy-api";
import { resetHistoryStoreForTests, upsertServerReadings, type ServerReading } from "./history-store";

const nativeShell = vi.hoisted(() => ({
  isNativeApp: vi.fn(() => false),
}));

vi.mock("./native-shell", () => nativeShell);

function workerLatest(rows: ServerReading[] = []) {
  return new Response(JSON.stringify({ rows }), { status: 200 });
}

function sampleReading(buoyId = "Lake Sammamish"): ServerReading {
  return {
    seq: 1,
    buoyId,
    timestamp: "2026-11-09T20:02:00.000Z",
    recordedAt: "2026-11-09T20:00:00.000Z",
    tempC: 18.5,
    tempF: 65,
    airTempC: 16,
    airTempF: 61,
    windSpeed: 4,
    precipitation: null,
    humidity: 55,
    dewpoint: 10,
    precipitationProbability: 20,
    lat: 47.58167,
    lon: -122.09,
    updatedAt: "2026-11-09T20:00:00.000Z",
  };
}

function mockFetch(opts: { latestRows?: ServerReading[]; workerDown?: boolean; kcDown?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/v1/latest")) {
      if (opts.workerDown) return new Response("down", { status: 503 });
      return workerLatest(opts.latestRows ?? [sampleReading(), sampleReading("Lake Washington")]);
    }
    if (url.includes("/api/kc") || url.includes("green2.kingcounty.gov") || url.endsWith("/api/kc")) {
      if (opts.kcDown) return new Response("error", { status: 500 });
      return new Response(SAMPLE_KC_RESPONSE, { status: 200 });
    }
    if (url.includes("api.weather.gov/points/")) {
      return new Response(JSON.stringify(SAMPLE_NWS_POINT), { status: 200 });
    }
    if (url.includes("forecast/hourly")) {
      return new Response(JSON.stringify(SAMPLE_NWS_HOURLY), { status: 200 });
    }
    if (url.includes("forecast") && !url.includes("hourly")) {
      return new Response(JSON.stringify(SAMPLE_NWS_DAILY), { status: 200 });
    }
    if (url.includes("alerts/active")) {
      return new Response(JSON.stringify(SAMPLE_NWS_ALERTS), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("getKingCountyUrl", () => {
  afterEach(() => {
    nativeShell.isNativeApp.mockReturnValue(false);
  });

  it("uses the Vite proxy path on web", () => {
    nativeShell.isNativeApp.mockReturnValue(false);
    expect(getKingCountyUrl()).toBe("/api/kc");
  });

  it("uses the direct King County URL on Capacitor native", () => {
    nativeShell.isNativeApp.mockReturnValue(true);
    expect(getKingCountyUrl()).toBe(KC_DIRECT_URL);
  });
});

describe("getBuoyData", () => {
  beforeEach(async () => {
    resetBuoyApiForTests();
    nativeShell.isNativeApp.mockReturnValue(false);
    sessionStorage.clear();
    await resetHistoryStoreForTests();
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers Worker latest into IndexedDB, then augments with NWS", async () => {
    const data = await getBuoyData("Lake Sammamish");
    expect(data.location).toBe("Lake Sammamish Buoy");
    expect(data.tempC).toBeCloseTo(18.5, 1);
    expect(data.status).toBe("ACTIVE");
    expect(data.hourlyForecast?.length).toBeGreaterThan(0);
    expect(data.sunrise).toBeTruthy();
  });

  it("falls back to King County when Worker is down and replica is empty", async () => {
    vi.stubGlobal("fetch", mockFetch({ workerDown: true }));
    const data = await getBuoyData("Lake Sammamish");
    expect(data.location).toBe("Lake Sammamish Buoy");
    expect(data.tempC).toBeCloseTo(18.5, 1);
    expect(data.status).toBe("ACTIVE");
  });

  it("on native, hits King County directly when Worker is down and replica is empty", async () => {
    nativeShell.isNativeApp.mockReturnValue(true);
    const fetchMock = mockFetch({ workerDown: true });
    vi.stubGlobal("fetch", fetchMock);
    const data = await getBuoyData("Lake Sammamish");
    expect(data.tempC).toBeCloseTo(18.5, 1);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("green2.kingcounty.gov"))).toBe(
      true
    );
  });

  it("returns session cache when live fetch fails", async () => {
    const cached: BuoyData = {
      location: "Lake Sammamish Buoy",
      tempC: 20,
      tempF: 68,
      airTempC: 18,
      airTempF: 64,
      windSpeed: 4,
      precipitation: 0,
      humidity: 50,
      dewpoint: 10,
      precipitationProbability: 0,
      lat: 47.58,
      lon: -122.09,
      timestamp: new Date().toISOString(),
      status: "ACTIVE",
      condition: "Moderate",
      lastSync: new Date().toISOString(),
      hourlyForecast: [],
      dailyForecast: [],
      alerts: [],
    };
    sessionStorage.setItem("2lakes-buoy-cache:Lake Sammamish", JSON.stringify(cached));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 }))
    );

    const data = await getBuoyData("Lake Sammamish");
    expect(data.tempC).toBe(20);
    expect(data.location).toBe("Lake Sammamish Buoy");
  });

  it("reads an already-synced replica without needing King County", async () => {
    await upsertServerReadings([sampleReading()]);
    vi.stubGlobal("fetch", mockFetch({ workerDown: true, kcDown: true }));
    // Worker down, but /v1/latest fails — hydrate fails; local row still there.
    // fetchLatest throws, then getLatestReading finds the row we upserted.
    const data = await getBuoyData("Lake Sammamish");
    expect(data.tempC).toBeCloseTo(18.5, 1);
  });
});

describe("getAllBuoys", () => {
  beforeEach(async () => {
    resetBuoyApiForTests();
    await resetHistoryStoreForTests();
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns configured lakes including Worker-backed Sammamish", async () => {
    const buoys = await getAllBuoys();
    expect(buoys.some((b) => b.name === "Lake Sammamish")).toBe(true);
    const sammamish = buoys.find((b) => b.name === "Lake Sammamish");
    expect(sammamish?.tempC).toBeCloseTo(18.5, 1);
  });
});

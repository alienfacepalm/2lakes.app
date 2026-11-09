import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuoyData } from "../types";
import {
  SAMPLE_KC_RESPONSE,
  SAMPLE_NWS_ALERTS,
  SAMPLE_NWS_DAILY,
  SAMPLE_NWS_HOURLY,
  SAMPLE_NWS_POINT,
} from "../test/fixtures/king-county";
import { getAllBuoys, getBuoyData, resetBuoyApiForTests } from "./buoy-api";

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/kc") || url.endsWith("/api/kc")) {
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

describe("getBuoyData", () => {
  beforeEach(() => {
    resetBuoyApiForTests();
    sessionStorage.clear();
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses King County payload and augments with NWS", async () => {
    const data = await getBuoyData("Lake Sammamish");
    expect(data.location).toBe("Lake Sammamish Buoy");
    expect(data.tempC).toBeCloseTo(18.5, 1);
    expect(data.status).toBe("ACTIVE");
    expect(data.hourlyForecast?.length).toBeGreaterThan(0);
    expect(data.sunrise).toBeTruthy();
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
});

describe("getAllBuoys", () => {
  beforeEach(() => {
    resetBuoyApiForTests();
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns configured lakes including parsed Sammamish", async () => {
    const buoys = await getAllBuoys();
    const sammamish = buoys.find((b) => b.name === "Lake Sammamish");
    expect(sammamish?.tempC).toBeCloseTo(18.5, 1);
    expect(buoys.length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to offline buoys when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const buoys = await getAllBuoys();
    expect(buoys.every((b) => b.tempC === null)).toBe(true);
    expect(buoys.some((b) => b.name === "Lake Washington")).toBe(true);
  });
});

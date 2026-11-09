import { describe, it, expect, beforeEach } from "vitest";
import { saveSnapshot, loadHistory, resetHistoryStoreForTests } from "./history-store";
import type { BuoyData } from "../types";

const sampleBuoy = (timestamp: string): BuoyData => ({
  location: "Lake Sammamish Buoy",
  tempC: 18.5,
  tempF: 65,
  airTempC: 20,
  airTempF: 68,
  windSpeed: 5,
  precipitation: null,
  humidity: 55,
  dewpoint: 12,
  precipitationProbability: 0,
  timestamp,
  status: "ACTIVE",
  condition: "Moderate",
  lastSync: new Date().toISOString(),
  lat: 47.58,
  lon: -122.09,
});

describe("historyStore", () => {
  beforeEach(async () => {
    await resetHistoryStoreForTests();
  });

  it("saves and loads a snapshot for a buoy", async () => {
    const ts = "2026-06-23T12:00:00.000Z";
    await saveSnapshot("Lake Sammamish", sampleBuoy(ts));
    const history = await loadHistory("Lake Sammamish");
    expect(history).toHaveLength(1);
    expect(history[0]?.tempC).toBe(18.5);
    expect(history[0]?.time).toBe(ts);
  });

  it("dedupes snapshots by buoy and timestamp", async () => {
    const ts = "2026-06-23T12:00:00.000Z";
    await saveSnapshot("Lake Sammamish", sampleBuoy(ts));
    await saveSnapshot("Lake Sammamish", sampleBuoy(ts));
    const history = await loadHistory("Lake Sammamish");
    expect(history).toHaveLength(1);
  });
});

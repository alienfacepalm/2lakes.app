import { describe, expect, it } from "vitest";
import { BUOY_CONFIGS } from "../constants";
import { SAMPLE_KC_RESPONSE } from "../test/fixtures/king-county";
import {
  deriveCondition,
  findConfigForRawName,
  getVal,
  isBuoyActive,
  matchBuoyLine,
  mergeAllBuoys,
  parseBuoyLines,
  parseMapBuoyLine,
  pickBestTimestamp,
  resolveBuoyConfig,
} from "./buoy-parse";

describe("parseBuoyLines", () => {
  it("splits King County caret-delimited payload", () => {
    const lines = parseBuoyLines(SAMPLE_KC_RESPONSE);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toContain("Sammamish");
  });
});

describe("matchBuoyLine", () => {
  it("finds Lake Sammamish by config name", () => {
    const lines = parseBuoyLines(SAMPLE_KC_RESPONSE);
    const line = matchBuoyLine(lines, "Lake Sammamish");
    expect(line).toBeDefined();
    expect(line).toContain("Sammamish");
  });

  it("returns undefined for unknown buoy", () => {
    const lines = parseBuoyLines(SAMPLE_KC_RESPONSE);
    expect(matchBuoyLine(lines, "Lake Unknown")).toBeUndefined();
  });
});

describe("findConfigForRawName", () => {
  it("maps raw sensor name to configured buoy", () => {
    const match = findConfigForRawName("Sammamish");
    expect(match?.[0]).toBe("Lake Sammamish");
  });
});

describe("resolveBuoyConfig", () => {
  it("returns defaults for ad-hoc buoy names", () => {
    const cfg = resolveBuoyConfig("Custom Lake");
    expect(cfg.searchName).toBe("custom");
    expect(cfg.fullName).toBe("Custom Lake");
  });

  it("returns configured lake coordinates", () => {
    const cfg = resolveBuoyConfig("Lake Washington");
    expect(cfg.defaultLat).toBe(BUOY_CONFIGS["Lake Washington"].defaultLat);
  });
});

describe("deriveCondition", () => {
  it("classifies warm water", () => {
    expect(deriveCondition(true, 24, 0, 3)).toBe("Warm");
  });

  it("classifies cold water", () => {
    expect(deriveCondition(true, 10, 0, 3)).toBe("Cold");
  });

  it("returns unknown when inactive", () => {
    expect(deriveCondition(false, 20, 0, 3)).toBe("Unknown");
  });
});

describe("parseMapBuoyLine", () => {
  it("parses temperature and active flag", () => {
    const lines = parseBuoyLines(SAMPLE_KC_RESPONSE);
    const buoy = parseMapBuoyLine(lines[0]!);
    expect(buoy?.name).toBe("Lake Sammamish");
    expect(buoy?.tempC).toBeCloseTo(18.5, 1);
    expect(buoy?.active).toBe(true);
  });
});

describe("mergeAllBuoys", () => {
  it("fills missing configured buoys as offline", () => {
    const lines = parseBuoyLines(SAMPLE_KC_RESPONSE);
    const parsed = lines.map((line) => parseMapBuoyLine(line)).filter((b) => b !== null);
    const merged = mergeAllBuoys(parsed);
    expect(merged.some((b) => b.name === "Lake Washington")).toBe(true);
    expect(merged.length).toBeGreaterThanOrEqual(Object.keys(BUOY_CONFIGS).length);
  });
});

describe("sensor helpers", () => {
  it("reads indexed pipe values", () => {
    const parts = "Sammamish|ts|18|5|0|18.5|ts2|47.58|-122.09|0|0|55|12|Y".split("|");
    expect(getVal(parts, 0, 5)).toBe(18.5);
    expect(isBuoyActive(parts, 18.5, 18, 5)).toBe(true);
  });

  it("picks the newest timestamp", () => {
    const parts = [
      "Sammamish",
      "2026-06-23T10:00:00Z",
      "18",
      "5",
      "0",
      "18.5",
      "2026-06-23T12:00:00Z",
      "47.58",
      "-122.09",
      "Y",
    ];
    expect(pickBestTimestamp(parts, 0)).toBe("2026-06-23T12:00:00Z");
  });
});

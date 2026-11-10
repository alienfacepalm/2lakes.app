import { describe, expect, it } from "vitest";
import { readingsFromFeed } from "../src/feed";

/** A real King County feed captured on 2026-11-09 (tabs preserved). */
const T = "\t";
const FEED = [
  `RUSS Edmondson|${T}|${T}|${T}|${T}NA|${T}|${T}|${T}47.63538|${T}-122.27069|${T}N`,
  `RUSS N. SAMM|${T}|${T}|${T}|${T}NA|${T}|${T}|${T}47.62338|${T}-122.07998|${T}N`,
  `RUSS N. WA|${T}|${T}|${T}|${T}NA|${T}|${T}|${T}47.68707|${T}-122.23319|${T}N`,
  `RUSS S. WA|${T}|${T}|${T}|${T}NA|${T}|${T}|${T}47.59263|${T}-122.27336|${T}N`,
  `Sammamish|${T}11/9/2026 3:02:00 PM|${T}11.9|${T}0.0|${T}from SE|${T}13.18|${T}11/9/2026 8:03:00 AM|${T}47.58167|${T}-122.09000|${T}Y`,
  `Washington|${T}11/9/2026 2:02:00 PM|${T}12.1|${T}0.6|${T}from SE|${T}13.51|${T}11/9/2026 9:52:00 AM|${T}47.61222|${T}-122.25428|${T}Y`,
  "",
].join("^");

describe("readingsFromFeed", () => {
  const readings = readingsFromFeed(FEED);

  it("returns only the two lakes with real readings, not the inactive RUSS sensors", () => {
    expect(readings.map((r) => r.buoyId).sort()).toEqual(["Lake Sammamish", "Lake Washington"]);
  });

  it("stores canonical UTC timestamps (King County label + 8 hours)", () => {
    const byBuoy = Object.fromEntries(readings.map((r) => [r.buoyId, r]));
    expect(byBuoy["Lake Sammamish"]!.timestamp).toBe("2026-11-09T23:02:00.000Z");
    expect(byBuoy["Lake Washington"]!.timestamp).toBe("2026-11-09T22:02:00.000Z");
  });

  it("keeps the measurements and leaves the NWS field for the NWS step", () => {
    const sammamish = readings.find((r) => r.buoyId === "Lake Sammamish")!;
    expect(sammamish.tempC).toBe(13.18);
    expect(sammamish.airTempC).toBe(11.9);
    expect(sammamish.windSpeed).toBe(0);
    expect(sammamish.lat).toBeCloseTo(47.58167);
    expect(sammamish.precipitationProbability).toBeNull();
  });

  it("returns nothing for an empty or garbage feed", () => {
    expect(readingsFromFeed("")).toEqual([]);
    expect(readingsFromFeed("<html>blocked</html>")).toEqual([]);
  });
});

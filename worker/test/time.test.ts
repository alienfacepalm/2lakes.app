import { describe, expect, it } from "vitest";
import { kingCountyLabelToUtcIso, kingCountyLabelToUtcMs } from "../src/time";

describe("kingCountyLabelToUtcIso", () => {
  it("adds 8 hours to a 12-hour King County label (fixed UTC-8)", () => {
    expect(kingCountyLabelToUtcIso("11/9/2026 3:02:00 PM")).toBe("2026-11-09T23:02:00.000Z");
    expect(kingCountyLabelToUtcIso("11/9/2026 2:02:00 PM")).toBe("2026-11-09T22:02:00.000Z");
  });

  it("uses the same +8h in summer, because King County does not observe daylight saving", () => {
    expect(kingCountyLabelToUtcIso("7/15/2026 3:02:00 PM")).toBe("2026-07-15T23:02:00.000Z");
  });

  it("rolls over midnight into the next UTC day", () => {
    expect(kingCountyLabelToUtcIso("12/31/2026 11:02:00 PM")).toBe("2027-01-01T07:02:00.000Z");
  });

  it("handles 12 AM and 12 PM", () => {
    expect(kingCountyLabelToUtcIso("1/2/2026 12:02:00 AM")).toBe("2026-01-02T08:02:00.000Z");
    expect(kingCountyLabelToUtcIso("1/2/2026 12:02:00 PM")).toBe("2026-01-02T20:02:00.000Z");
  });

  it("accepts a 24-hour label and a missing seconds field", () => {
    expect(kingCountyLabelToUtcIso("04/11/2026 22:02:00")).toBe("2026-04-12T06:02:00.000Z");
    expect(kingCountyLabelToUtcIso("4/11/2026 1:02 PM")).toBe("2026-04-11T21:02:00.000Z");
  });

  it("rejects labels that are empty, impossible, or already ISO", () => {
    expect(kingCountyLabelToUtcIso("")).toBeNull();
    expect(kingCountyLabelToUtcIso(undefined)).toBeNull();
    expect(kingCountyLabelToUtcIso("NA")).toBeNull();
    expect(kingCountyLabelToUtcIso("2/31/2026 3:02:00 PM")).toBeNull();
    expect(kingCountyLabelToUtcIso("13/1/2026 3:02:00 PM")).toBeNull();
    expect(kingCountyLabelToUtcIso("1/1/2026 13:02:00 PM")).toBeNull();
    expect(kingCountyLabelToUtcIso("2026-11-09T23:02:00.000Z")).toBeNull();
  });

  it("does not depend on the timezone of the machine running it", () => {
    expect(kingCountyLabelToUtcMs("11/9/2026 3:02:00 PM")).toBe(Date.UTC(2026, 10, 9, 23, 2, 0));
  });
});

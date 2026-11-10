import { describe, expect, it } from "vitest";
import { kingCountyLabelToUtcIso, kingCountyLabelToUtcMs } from "./kc-time";

describe("kingCountyLabelToUtcIso", () => {
  it("adds a fixed 8 hours (UTC-8 wall clock, no DST)", () => {
    expect(kingCountyLabelToUtcIso("11/9/2026 3:02:00 PM")).toBe("2026-11-09T23:02:00.000Z");
    expect(kingCountyLabelToUtcIso("4/15/2026 10:00:00 AM")).toBe("2026-04-15T18:00:00.000Z");
  });

  it("rejects garbage and never uses the runtime timezone", () => {
    expect(kingCountyLabelToUtcIso("not a date")).toBeNull();
    expect(kingCountyLabelToUtcMs("")).toBeNull();
  });
});

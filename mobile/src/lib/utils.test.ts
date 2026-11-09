import { describe, expect, it } from "vitest";
import { getTemperatureColor, TEMP_SCALE } from "./utils";

describe("TEMP_SCALE", () => {
  it("covers the full temperature range without gaps", () => {
    expect(TEMP_SCALE[0]?.min).toBe(-Infinity);
    expect(TEMP_SCALE.at(-1)?.max).toBe(125);
  });
});

describe("getTemperatureColor", () => {
  it("returns indigo for cold water", () => {
    expect(getTemperatureColor(40)).toContain("indigo");
  });

  it("returns emerald for comfortable water", () => {
    expect(getTemperatureColor(70)).toContain("emerald");
  });

  it("returns red for very warm water", () => {
    expect(getTemperatureColor(110)).toContain("red");
  });

  it("handles invalid input", () => {
    expect(getTemperatureColor(Number.NaN)).toBe("text-on-surface");
  });
});

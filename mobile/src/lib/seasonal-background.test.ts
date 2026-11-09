import { describe, expect, it } from "vitest";
import { getBuoyBackground, getSeasonFromDate, getSeasonalLakeBackground } from "./seasonal-background";

describe("getSeasonFromDate", () => {
  it("maps Washington meteorological seasons", () => {
    expect(getSeasonFromDate(new Date(2026, 2, 20))).toBe("spring");
    expect(getSeasonFromDate(new Date(2026, 5, 23))).toBe("summer");
    expect(getSeasonFromDate(new Date(2026, 9, 15))).toBe("fall");
    expect(getSeasonFromDate(new Date(2026, 0, 10))).toBe("winter");
  });
});

describe("getSeasonalLakeBackground", () => {
  it("returns local seasonal assets", () => {
    expect(getSeasonalLakeBackground(new Date(2026, 5, 23))).toBe(
      "/backgrounds/lake-washington-summer.png",
    );
    expect(getBuoyBackground(new Date(2026, 11, 1))).toBe(
      "/backgrounds/lake-washington-winter.png",
    );
  });
});

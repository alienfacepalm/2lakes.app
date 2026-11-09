export type LakeSeason = "spring" | "summer" | "fall" | "winter";

const SEASONAL_LAKE_BACKGROUNDS: Record<LakeSeason, string> = {
  spring: "/backgrounds/lake-washington-spring.png",
  summer: "/backgrounds/lake-washington-summer.png",
  fall: "/backgrounds/lake-washington-fall.png",
  winter: "/backgrounds/lake-washington-winter.png",
};

/** Northern-hemisphere meteorological seasons (Washington state). */
export function getSeasonFromDate(date: Date = new Date()): LakeSeason {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

export function getSeasonalLakeBackground(date: Date = new Date()): string {
  return SEASONAL_LAKE_BACKGROUNDS[getSeasonFromDate(date)];
}

export function getBuoyBackground(date: Date = new Date()): string {
  return getSeasonalLakeBackground(date);
}

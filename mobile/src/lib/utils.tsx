import { 
  Waves, 
  Sun, 
  Cloud, 
  CloudRain, 
  Wind, 
  ThermometerSnowflake, 
  ThermometerSun, 
  CloudDrizzle, 
  Cloudy as CloudyIcon 
} from "lucide-react";

export { getBuoyBackground, getSeasonFromDate, getSeasonalLakeBackground } from "./seasonal-background";
export type { LakeSeason } from "./seasonal-background";

export const getConditionIcon = (condition: string, colorClass?: string) => {
  const iconClass = `w-12 h-12 ${colorClass || "text-on-surface-variant"}`;
  
  if (condition === "Warm") return <ThermometerSun className={colorClass || "w-12 h-12 text-yellow-400"} />;
  if (condition === "Moderate") return <Sun className={colorClass || "w-12 h-12 text-orange-400"} />;
  if (condition === "Cold") return <ThermometerSnowflake className={colorClass || "w-12 h-12 text-blue-400"} />;
  if (condition === "Cloudy") return <Cloud className={iconClass} />;
  if (condition === "Overcast") return <CloudyIcon className={iconClass} opacity={0.8} />;
  if (condition === "Windy") return <Wind className={iconClass} />;
  if (condition === "Rainy") return <CloudRain className={iconClass} />;
  if (condition === "Showers") return <CloudDrizzle className={iconClass} opacity={0.8} />;
  return <Waves className={iconClass} opacity={0.4} />;
};

export const BUOY_CARD_BG_CLASS = "buoy-card-bg";

export const TEMP_SCALE = [
  { min: -Infinity, max: 45, color: "indigo", classes: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-600 dark:bg-indigo-400" },
  { min: 45, max: 55, color: "blue", classes: "text-blue-600 dark:text-blue-400", bg: "bg-blue-600 dark:bg-blue-400" },
  { min: 55, max: 65, color: "cyan", classes: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-600 dark:bg-cyan-400" },
  { min: 65, max: 75, color: "emerald", classes: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500 dark:bg-emerald-400" },
  { min: 75, max: 85, color: "amber", classes: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500 dark:bg-amber-400" },
  { min: 85, max: 100, color: "orange", classes: "text-orange-500 dark:text-orange-400", bg: "bg-orange-500 dark:bg-orange-400" },
  { min: 100, max: 125, color: "red", classes: "text-red-600 dark:text-red-500", bg: "bg-red-600 dark:bg-red-500" },
];

export const getTemperatureColor = (tempF: number) => {
  if (typeof tempF !== 'number' || isNaN(tempF)) return "text-on-surface";
  const step = TEMP_SCALE.find(s => tempF < s.max);
  return step ? step.classes : "text-red-700 dark:text-red-600";
};

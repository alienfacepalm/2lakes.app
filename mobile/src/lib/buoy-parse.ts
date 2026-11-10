import { BUOY_CONFIGS } from "../constants";
import type { BuoyData, MapBuoy } from "../types";
import { kingCountyLabelToUtcIso } from "./kc-time";

export type TBuoyConfig = (typeof BUOY_CONFIGS)[keyof typeof BUOY_CONFIGS] & {
  fullName: string;
};

export function parseBuoyLines(text: string): string[] {
  return text.split("^").filter((line) => line.trim() !== "");
}

export function findConfigForRawName(
  rawName: string
): [string, (typeof BUOY_CONFIGS)[keyof typeof BUOY_CONFIGS]] | null {
  const configEntry = Object.entries(BUOY_CONFIGS).find(([name, cfg]) => {
    const ln = rawName.toLowerCase();
    const sn = cfg.searchName.toLowerCase();
    const fn = name.toLowerCase();
    return ln === sn || ln === fn || ln.includes(sn);
  });
  return configEntry ?? null;
}

export function resolveBuoyConfig(requestedBuoy: string): TBuoyConfig {
  const configEntry = Object.entries(BUOY_CONFIGS).find(([name]) => name === requestedBuoy);
  if (configEntry) {
    return { ...configEntry[1], fullName: configEntry[0] };
  }
  return {
    searchName: requestedBuoy.toLowerCase().replace(" buoy", "").replace(" lake", "").trim(),
    fullName: requestedBuoy,
    defaultLat: 47.6,
    defaultLon: -122.3,
  };
}

export function matchBuoyLine(lines: string[], requestedBuoy: string): string | undefined {
  const config = resolveBuoyConfig(requestedBuoy);

  return lines.find((line) => {
    const parts = line.split("|").map((p) => p.trim());
    const namePart = parts.find((p) => p.length > 0 && !p.startsWith("\t"));
    if (!namePart) return false;
    const ln = namePart.toLowerCase();
    const sn = config.searchName.toLowerCase();
    const fn = config.fullName.toLowerCase();
    if (ln === sn || ln === fn) return true;
    if (ln.includes(sn) && ln.includes("lake") && !ln.includes("river")) return true;
    if (ln.includes(sn) && ln.includes("river") && !ln.includes("lake")) return true;
    return false;
  });
}

export function getVal(parts: string[], nameIndex: number, idx: number): number {
  const val = parts[nameIndex + idx];
  if (val === undefined || val === "" || val === null) return NaN;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? NaN : parsed;
}

export function findNameIndex(parts: string[], config: TBuoyConfig): number {
  return parts.findIndex((p) => {
    const lp = p.toLowerCase();
    const sn = config.searchName.toLowerCase();
    const fn = config.fullName.toLowerCase();
    return lp === sn || lp === fn || lp.includes(sn);
  });
}

function coerceUtcTimestamp(raw: string | undefined): string | null {
  if (!raw) return null;
  const fromKc = kingCountyLabelToUtcIso(raw);
  if (fromKc) return fromKc;
  // Fixtures / already-UTC ISO — never use this path for bare King County labels.
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function pickBestTimestamp(parts: string[], nameIndex: number): string {
  const iso1 = coerceUtcTimestamp(parts[nameIndex + 1]);
  const iso2 = coerceUtcTimestamp(parts[nameIndex + 6]);
  if (iso1 && iso2) return Date.parse(iso2) > Date.parse(iso1) ? iso2 : iso1;
  return iso1 || iso2 || new Date().toISOString();
}

export function isBuoyActive(parts: string[], tempC: number, airTempC: number, windSpeed: number): boolean {
  const activeIndicator = parts[parts.length - 1]?.trim().replace(/\^$/, "").toUpperCase();
  return activeIndicator === "Y" || !isNaN(tempC) || !isNaN(airTempC) || !isNaN(windSpeed);
}

export function deriveCondition(
  isActive: boolean,
  tempC: number,
  precipitation: number,
  windSpeed: number
): string {
  if (!isActive) return "Unknown";
  let condition = "Moderate";
  if (!isNaN(precipitation) && precipitation > 0) {
    condition = precipitation > 0.1 ? "Rainy" : "Showers";
  } else if (!isNaN(tempC)) {
    if (tempC > 22) condition = "Warm";
    else if (tempC < 12) condition = "Cold";
    else if (windSpeed > 15) condition = "Windy";
    else if (tempC < 18 && windSpeed < 5) condition = "Overcast";
    else if (tempC < 18) condition = "Cloudy";
  }
  return condition;
}

/** Build snapshot-ready buoy data from a single King County line (no NWS calls). */
export function buoyDataFromKingCountyLine(line: string, buoyName: string): BuoyData | null {
  const config = resolveBuoyConfig(buoyName);
  const parts = line.split("|").map((p) => p.trim());
  const nameIndex = findNameIndex(parts, config);
  if (nameIndex === -1) return null;

  const tempC = getVal(parts, nameIndex, 5);
  const airTempC = getVal(parts, nameIndex, 2);
  const windSpeed = getVal(parts, nameIndex, 3);
  const precipitation = getVal(parts, nameIndex, 10);
  const humidity = getVal(parts, nameIndex, 11);
  const dewpoint = getVal(parts, nameIndex, 12);
  const lat = getVal(parts, nameIndex, 7) || config.defaultLat;
  const lon = getVal(parts, nameIndex, 8) || config.defaultLon;
  const isActive = isBuoyActive(parts, tempC, airTempC, windSpeed);
  const tempF = isNaN(tempC) ? null : (tempC * 9) / 5 + 32;
  const bestTimestamp = pickBestTimestamp(parts, nameIndex);
  const condition = deriveCondition(isActive, tempC, precipitation, windSpeed);

  return {
    location: `${config.fullName} Buoy`,
    tempC: isNaN(tempC) ? null : parseFloat(tempC.toFixed(2)),
    tempF: tempF === null ? null : Math.round(tempF),
    airTempC: isNaN(airTempC) ? null : parseFloat(airTempC.toFixed(2)),
    airTempF: isNaN(airTempC) ? null : Math.round((airTempC * 9) / 5 + 32),
    windSpeed: isNaN(windSpeed) ? null : parseFloat(windSpeed.toFixed(1)),
    precipitation: isNaN(precipitation) ? null : parseFloat(precipitation.toFixed(2)),
    humidity: isNaN(humidity) || humidity === 0 ? null : parseFloat(humidity.toFixed(1)),
    dewpoint: isNaN(dewpoint) ? null : parseFloat(dewpoint.toFixed(1)),
    precipitationProbability: 0,
    lat: isNaN(lat) ? null : lat,
    lon: isNaN(lon) ? null : lon,
    timestamp: bestTimestamp,
    status: isActive ? "ACTIVE" : "INACTIVE",
    condition,
    lastSync: new Date().toISOString(),
    hourlyForecast: [],
    dailyForecast: [],
    alerts: [],
  };
}

export function parseMapBuoyLine(line: string): MapBuoy | null {
  const parts = line.split("|").map((p) => p.trim());
  const nameIndex = parts.findIndex((p) => p.length > 0 && !p.startsWith("\t"));
  if (nameIndex === -1) return null;

  const rawName = parts[nameIndex];
  let displayName = rawName;

  const configEntry = findConfigForRawName(rawName);
  if (configEntry) {
    displayName = configEntry[0];
  } else {
    const partial = Object.entries(BUOY_CONFIGS).find(([, cfg]) =>
      rawName.toLowerCase().includes(cfg.searchName.toLowerCase())
    );
    if (partial) displayName = partial[0];
  }

  const tempC = getVal(parts, nameIndex, 5);
  const airTempC = getVal(parts, nameIndex, 2);
  const windSpeed = getVal(parts, nameIndex, 3);
  const latVal = getVal(parts, nameIndex, 7);
  const lonVal = getVal(parts, nameIndex, 8);
  const active = isBuoyActive(parts, tempC, airTempC, windSpeed);

  return {
    id: displayName.toLowerCase().replace(/\s+/g, "-"),
    name: displayName,
    tempC: isNaN(tempC) ? null : parseFloat(tempC.toFixed(2)),
    tempF: isNaN(tempC) ? null : Math.round((tempC * 9) / 5 + 32),
    lat: isNaN(latVal) ? 0 : latVal,
    lon: isNaN(lonVal) ? 0 : lonVal,
    active,
  };
}

export function mergeAllBuoys(apiBuoys: MapBuoy[]): MapBuoy[] {
  const finalResultsMap = new Map<string, MapBuoy>();
  apiBuoys.forEach((b) => {
    const key = b.name;
    if (!finalResultsMap.has(key) || (b.tempC !== null && finalResultsMap.get(key)!.tempC === null)) {
      finalResultsMap.set(key, b);
    }
  });

  Object.entries(BUOY_CONFIGS).forEach(([buoyName, cfg]) => {
    if (!finalResultsMap.has(buoyName)) {
      finalResultsMap.set(buoyName, {
        id: buoyName.toLowerCase().replace(/\s+/g, "-"),
        name: buoyName,
        tempC: null,
        tempF: null,
        lat: cfg.defaultLat,
        lon: cfg.defaultLon,
        active: false,
      });
    }
  });

  return Array.from(finalResultsMap.values());
}

export function fallbackAllBuoys(): MapBuoy[] {
  return Object.entries(BUOY_CONFIGS).map(([buoyName, cfg]) => ({
    id: buoyName.toLowerCase().replace(/\s+/g, "-"),
    name: buoyName,
    tempC: null,
    tempF: null,
    lat: cfg.defaultLat,
    lon: cfg.defaultLon,
    active: false,
  }));
}

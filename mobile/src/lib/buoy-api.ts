import { NWS_USER_AGENT, CACHE_TTL, NWS_TIMEOUT } from "../constants";
import type { BuoyData, MapBuoy } from "../types";
import {
  deriveCondition,
  fallbackAllBuoys,
  findNameIndex,
  getVal,
  isBuoyActive,
  matchBuoyLine,
  mergeAllBuoys,
  parseBuoyLines,
  parseMapBuoyLine,
  pickBestTimestamp,
  resolveBuoyConfig,
} from "./buoy-parse";
import {
  getLatestReading,
  getLatestReadings,
  saveSnapshot,
  upsertServerReadings,
  type SnapshotRecord,
} from "./history-store";
import { fetchLatestFromWorker } from "./sync";

const KC_URL = import.meta.env.VITE_KC_PROXY_URL || "/api/kc";

const nwsCache: Record<string, { data: NwsBundle; expires: number }> = {};
const CACHE_PREFIX = "2lakes-buoy-cache:";

function readCachedBuoy(buoyName: string): BuoyData | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${buoyName}`);
    return raw ? (JSON.parse(raw) as BuoyData) : null;
  } catch {
    return null;
  }
}

function writeCachedBuoy(buoyName: string, data: BuoyData) {
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${buoyName}`, JSON.stringify(data));
  } catch {
    /* storage full or private mode */
  }
}

interface NwsBundle {
  sunrise: string | null;
  sunset: string | null;
  hourlyForecast: BuoyData["hourlyForecast"];
  dailyForecast: BuoyData["dailyForecast"];
  alerts: BuoyData["alerts"];
  radarStation: string;
}

export async function fetchKingCountyRaw(): Promise<string> {
  const response = await fetch(KC_URL, {
    signal: AbortSignal.timeout(NWS_TIMEOUT),
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw new Error(`King County API error: ${response.status}`);
  return response.text();
}

/** Clears in-memory NWS cache between Vitest cases */
export function resetBuoyApiForTests() {
  for (const key of Object.keys(nwsCache)) {
    delete nwsCache[key];
  }
}

async function fetchNwsAugmentation(lat: number, lon: number): Promise<NwsBundle> {
  const empty: NwsBundle = {
    sunrise: null,
    sunset: null,
    hourlyForecast: [],
    dailyForecast: [],
    alerts: [],
    radarStation: "KATX",
  };

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = nwsCache[cacheKey];
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
      signal: AbortSignal.timeout(NWS_TIMEOUT),
      headers: { "User-Agent": NWS_USER_AGENT },
    });
    if (!pointRes.ok) return empty;

    const pointData = await pointRes.json();
    const hourlyUrl = pointData.properties.forecastHourly;
    const dailyUrl = pointData.properties.forecast;
    const forecastZone = pointData.properties.forecastZone;

    const [hourlyRes, dailyRes, alertsRes] = await Promise.allSettled([
      hourlyUrl
        ? fetch(hourlyUrl, { signal: AbortSignal.timeout(NWS_TIMEOUT), headers: { "User-Agent": NWS_USER_AGENT } })
        : Promise.reject("No hourly URL"),
      dailyUrl
        ? fetch(dailyUrl, { signal: AbortSignal.timeout(NWS_TIMEOUT), headers: { "User-Agent": NWS_USER_AGENT } })
        : Promise.reject("No daily URL"),
      forecastZone
        ? fetch(`https://api.weather.gov/alerts/active/zone/${forecastZone.split("/").pop()}`, {
            signal: AbortSignal.timeout(NWS_TIMEOUT),
            headers: { "User-Agent": NWS_USER_AGENT },
          })
        : Promise.reject("No zone ID"),
    ]);

    let hourlyForecast: NonNullable<BuoyData["hourlyForecast"]> = [];
    let dailyForecast: NonNullable<BuoyData["dailyForecast"]> = [];
    let alerts: NonNullable<BuoyData["alerts"]> = [];

    if (hourlyRes.status === "fulfilled" && hourlyRes.value.ok) {
      const forecastData = await hourlyRes.value.json();
      hourlyForecast = forecastData.properties.periods.slice(0, 24).map((p: Record<string, unknown>) => {
        const icon = p.icon as string | undefined;
        const iconProb = icon?.match(/,(\d+)/)?.[1];
        const pop = p.probabilityOfPrecipitation as { value?: number } | undefined;
        const rh = p.relativeHumidity as { value?: number } | undefined;
        const dp = p.dewpoint as { value?: number } | undefined;
        // Keep the first usable probability; never invent 0 when NWS omitted it.
        const fromIcon = iconProb ? parseInt(iconProb, 10) : NaN;
        const fromPop = typeof pop?.value === "number" ? pop.value : NaN;
        const prob = Number.isFinite(fromIcon) ? fromIcon : Number.isFinite(fromPop) ? fromPop : null;
        return {
          time: p.startTime as string,
          temp: p.temperature as number,
          condition: p.shortForecast as string,
          isDaytime: p.isDaytime as boolean,
          windSpeed: p.windSpeed as string,
          windDirection: p.windDirection as string | undefined,
          icon: icon || "",
          precipitationProbability: prob ?? 0,
          humidity: rh?.value ?? null,
          dewpoint: dp?.value ?? null,
        };
      });
    }

    if (dailyRes.status === "fulfilled" && dailyRes.value.ok) {
      const dailyData = await dailyRes.value.json();
      dailyForecast = dailyData.properties.periods.map((p: Record<string, unknown>) => {
        const icon = p.icon as string | undefined;
        const iconProb = icon?.match(/,(\d+)/)?.[1];
        const pop = p.probabilityOfPrecipitation as { value?: number } | undefined;
        const fromIcon = iconProb ? parseInt(iconProb, 10) : NaN;
        const fromPop = typeof pop?.value === "number" ? pop.value : NaN;
        const prob = Number.isFinite(fromIcon) ? fromIcon : Number.isFinite(fromPop) ? fromPop : null;
        return {
          name: p.name as string,
          temp: p.temperature as number,
          isDaytime: p.isDaytime as boolean,
          icon: icon || "",
          shortForecast: p.shortForecast as string,
          detailedForecast: p.detailedForecast as string,
          precipitationProbability: prob ?? 0,
        };
      });
    }

    if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
      const alertsData = await alertsRes.value.json();
      alerts = alertsData.features.map((f: { properties: Record<string, string> }) => ({
        event: f.properties.event,
        severity: f.properties.severity,
        headline: f.properties.headline,
        description: f.properties.description,
        instruction: f.properties.instruction,
      }));
    }

    const bundle: NwsBundle = {
      sunrise: pointData.properties.astronomicalData?.sunrise ?? null,
      sunset: pointData.properties.astronomicalData?.sunset ?? null,
      hourlyForecast,
      dailyForecast,
      alerts,
      radarStation: pointData.properties.radarStation || "KATX",
    };

    nwsCache[cacheKey] = { data: bundle, expires: Date.now() + CACHE_TTL };
    return bundle;
  } catch {
    return empty;
  }
}

function readingToBuoyData(row: SnapshotRecord, fullName: string): BuoyData {
  const tempC = row.tempC;
  const airTempC = row.airTempC;
  const windSpeed = row.windSpeed;
  const precipitation = row.precipitation;
  const isActive = tempC != null || airTempC != null || windSpeed != null;
  return {
    location: `${fullName} Buoy`,
    tempC: tempC ?? null,
    tempF: row.tempF ?? null,
    airTempC: airTempC ?? null,
    airTempF: row.airTempF ?? null,
    windSpeed: windSpeed ?? null,
    precipitation: precipitation ?? null,
    humidity: row.humidity ?? null,
    dewpoint: row.dewpoint ?? null,
    // D1 may store null when NWS failed — never coerce to 0 here.
    precipitationProbability: row.precipitationProbability ?? null,
    lat: row.lat ?? null,
    lon: row.lon ?? null,
    timestamp: row.timestamp,
    status: isActive ? "ACTIVE" : "INACTIVE",
    condition: deriveCondition(
      isActive,
      tempC ?? NaN,
      precipitation ?? NaN,
      windSpeed ?? NaN
    ),
    lastSync: new Date().toISOString(),
    hourlyForecast: [],
    dailyForecast: [],
    alerts: [],
  };
}

async function hydrateLatestFromWorker(): Promise<void> {
  const rows = await fetchLatestFromWorker();
  await upsertServerReadings(rows);
}

async function tryKingCountyProvisional(requestedBuoy: string): Promise<BuoyData | null> {
  const config = resolveBuoyConfig(requestedBuoy);
  const text = await fetchKingCountyRaw();
  const buoys = parseBuoyLines(text);
  const buoyLine = matchBuoyLine(buoys, requestedBuoy);
  if (!buoyLine) {
    return offlineBuoy(config.fullName, config.defaultLat, config.defaultLon, "INACTIVE");
  }

  const parts = buoyLine.split("|").map((p) => p.trim());
  const nameIndex = findNameIndex(parts, config);
  if (nameIndex === -1) throw new Error(`Could not locate ${requestedBuoy} in data line`);

  const tempC = getVal(parts, nameIndex, 5);
  let airTempC = getVal(parts, nameIndex, 2);
  let windSpeed = getVal(parts, nameIndex, 3);
  const precipitation = getVal(parts, nameIndex, 10);
  const humidity = getVal(parts, nameIndex, 11);
  const dewpoint = getVal(parts, nameIndex, 12);
  const lat = getVal(parts, nameIndex, 7) || config.defaultLat;
  const lon = getVal(parts, nameIndex, 8) || config.defaultLon;

  const isActive = isBuoyActive(parts, tempC, airTempC, windSpeed);
  const tempF = isNaN(tempC) ? null : (tempC * 9) / 5 + 32;
  const bestTimestamp = pickBestTimestamp(parts, nameIndex);
  const condition = deriveCondition(isActive, tempC, precipitation, windSpeed);

  const nws =
    !isNaN(lat) && !isNaN(lon)
      ? await fetchNwsAugmentation(lat, lon)
      : await fetchNwsAugmentation(config.defaultLat, config.defaultLon);
  const hourlyForecast = nws.hourlyForecast || [];

  if (isNaN(airTempC) && hourlyForecast[0]) {
    airTempC = ((hourlyForecast[0].temp - 32) * 5) / 9;
  }
  if (isNaN(windSpeed) && hourlyForecast[0]) {
    windSpeed = parseInt(hourlyForecast[0].windSpeed, 10);
  }

  const firstHourPop = hourlyForecast[0]?.precipitationProbability;
  const result: BuoyData = {
    location: `${config.fullName} Buoy`,
    tempC: isNaN(tempC) ? null : parseFloat(tempC.toFixed(2)),
    tempF: tempF === null ? null : Math.round(tempF),
    airTempC: isNaN(airTempC) ? null : parseFloat(airTempC.toFixed(2)),
    airTempF: isNaN(airTempC) ? null : Math.round((airTempC * 9) / 5 + 32),
    windSpeed: isNaN(windSpeed) ? null : parseFloat(windSpeed.toFixed(1)),
    precipitation:
      isNaN(precipitation) || precipitation === null
        ? firstHourPop && firstHourPop > 0
          ? firstHourPop / 100
          : null
        : parseFloat(precipitation.toFixed(2)),
    humidity:
      isNaN(humidity) || humidity === null || humidity === 0
        ? hourlyForecast[0]?.humidity ?? null
        : parseFloat(humidity.toFixed(1)),
    dewpoint:
      isNaN(dewpoint) || dewpoint === null ? hourlyForecast[0]?.dewpoint ?? null : parseFloat(dewpoint.toFixed(1)),
    precipitationProbability: typeof firstHourPop === "number" ? firstHourPop : null,
    lat: isNaN(lat) ? null : lat,
    lon: isNaN(lon) ? null : lon,
    timestamp: bestTimestamp,
    status: isActive ? "ACTIVE" : "INACTIVE",
    condition,
    lastSync: new Date().toISOString(),
    sunrise: nws.sunrise ?? undefined,
    sunset: nws.sunset ?? undefined,
    hourlyForecast,
    dailyForecast: nws.dailyForecast,
    alerts: nws.alerts,
    radarStation: nws.radarStation,
  };

  // Provisional local row only — D1 will replace it on the next sync.
  await saveSnapshot(requestedBuoy, result).catch(() => undefined);
  return result;
}

/**
 * Live conditions for one buoy. The screen reads IndexedDB; this function only fills the
 * replica (Worker first, then King County on Android/local/proxy) and attaches NWS weather.
 */
export async function getBuoyData(requestedBuoy: string): Promise<BuoyData> {
  const config = resolveBuoyConfig(requestedBuoy);

  try {
    // 1. Pull the newest D1 rows into the local replica when online.
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      try {
        await hydrateLatestFromWorker();
      } catch {
        /* Worker down — try what we already have, then King County */
      }
    }

    // 2. Screens read the replica, not the network.
    const row = await getLatestReading(requestedBuoy);

    // 3. Direct King County only when the replica has nothing (Android / local proxy).
    if (!row) {
      try {
        const fromKc = await tryKingCountyProvisional(requestedBuoy);
        if (fromKc) {
          writeCachedBuoy(requestedBuoy, fromKc);
          return fromKc;
        }
      } catch {
        /* no KC path available in a plain browser on Pages */
      }
    }

    if (row) {
      const base = readingToBuoyData(row, config.fullName);
      const lat = base.lat ?? config.defaultLat;
      const lon = base.lon ?? config.defaultLon;
      const nws = await fetchNwsAugmentation(lat, lon);
      const hourlyForecast = nws.hourlyForecast || [];

      let airTempC = base.airTempC;
      let windSpeed = base.windSpeed;
      if (airTempC == null && hourlyForecast[0]) {
        airTempC = ((hourlyForecast[0].temp - 32) * 5) / 9;
      }
      if (windSpeed == null && hourlyForecast[0]) {
        windSpeed = parseInt(hourlyForecast[0].windSpeed, 10);
      }

      const result: BuoyData = {
        ...base,
        airTempC: airTempC == null || Number.isNaN(airTempC) ? null : parseFloat(airTempC.toFixed(2)),
        airTempF:
          airTempC == null || Number.isNaN(airTempC) ? null : Math.round((airTempC * 9) / 5 + 32),
        windSpeed: windSpeed == null || Number.isNaN(windSpeed) ? null : parseFloat(Number(windSpeed).toFixed(1)),
        precipitationProbability:
          base.precipitationProbability ?? hourlyForecast[0]?.precipitationProbability ?? null,
        sunrise: nws.sunrise ?? undefined,
        sunset: nws.sunset ?? undefined,
        hourlyForecast,
        dailyForecast: nws.dailyForecast,
        alerts: nws.alerts,
        radarStation: nws.radarStation,
      };
      writeCachedBuoy(requestedBuoy, result);
      return result;
    }

    const cached = readCachedBuoy(requestedBuoy);
    if (cached) return cached;
    return offlineBuoy(config.fullName, config.defaultLat, config.defaultLon, "OFFLINE", true);
  } catch (error) {
    console.error(`[buoyApi] Error fetching ${requestedBuoy}:`, error);
    const cached = readCachedBuoy(requestedBuoy);
    if (cached) return cached;
    return offlineBuoy(config.fullName, config.defaultLat, config.defaultLon, "OFFLINE", true);
  }
}

function offlineBuoy(
  fullName: string,
  lat: number,
  lon: number,
  status: string,
  isFallback = false
): BuoyData {
  return {
    location: `${fullName} Buoy${isFallback ? " (Offline)" : ""}`,
    tempC: null,
    tempF: null,
    airTempC: null,
    airTempF: null,
    windSpeed: null,
    precipitation: null,
    humidity: null,
    dewpoint: null,
    precipitationProbability: null,
    lat,
    lon,
    timestamp: new Date().toISOString(),
    status,
    condition: "Unknown",
    lastSync: new Date().toISOString(),
    hourlyForecast: [],
    dailyForecast: [],
    alerts: [],
  };
}

function mapBuoyFromReading(row: SnapshotRecord): MapBuoy {
  return {
    id: row.buoyId.toLowerCase().replace(/\s+/g, "-"),
    name: row.buoyId,
    tempC: row.tempC,
    tempF: row.tempF,
    lat: row.lat ?? 0,
    lon: row.lon ?? 0,
    active: row.tempC != null || row.airTempC != null || row.windSpeed != null,
  };
}

export async function getAllBuoys() {
  try {
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      try {
        await hydrateLatestFromWorker();
      } catch {
        /* fall through to local / KC */
      }
    }

    const local = await getLatestReadings();
    if (local.length > 0) {
      return mergeAllBuoys(local.map(mapBuoyFromReading));
    }

    try {
      const text = await fetchKingCountyRaw();
      const lines = parseBuoyLines(text);
      const apiBuoys = lines.map((line) => parseMapBuoyLine(line)).filter((b) => b !== null);
      return mergeAllBuoys(apiBuoys);
    } catch {
      return fallbackAllBuoys();
    }
  } catch (error) {
    console.error("[buoyApi] Error fetching all buoys:", error);
    return fallbackAllBuoys();
  }
}

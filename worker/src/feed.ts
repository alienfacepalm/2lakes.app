import {
  buoyDataFromKingCountyLine,
  parseBuoyLines,
  parseMapBuoyLine,
} from "../../mobile/src/lib/buoy-parse";
import { kingCountyLabelToUtcIso } from "./time";

/** One reading, ready to store. `timestamp` is canonical UTC ISO (see time.ts). */
export interface Reading {
  buoyId: string;
  timestamp: string;
  tempC: number | null;
  tempF: number | null;
  airTempC: number | null;
  airTempF: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  humidity: number | null;
  dewpoint: number | null;
  precipitationProbability: number | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Parse the King County `GenerateMapData.aspx` text into readings. Reuses the same parser
 * as the app (`mobile/src/lib/buoy-parse.ts`).
 *
 * Skipped: sensors with no usable timestamp or no measurements (the inactive "RUSS" rows).
 * The app's parser would stamp those with "now", which is how junk rows reached Firestore.
 *
 * `precipitationProbability` starts as null. The parser sets 0, which would claim a
 * forecast we do not have, so only the NWS step may fill it in.
 */
export function readingsFromFeed(text: string): Reading[] {
  const byKey = new Map<string, Reading>();

  for (const line of parseBuoyLines(text)) {
    const buoy = parseMapBuoyLine(line);
    if (!buoy) continue;
    const data = buoyDataFromKingCountyLine(line, buoy.name);
    if (!data) continue;

    const timestamp = kingCountyLabelToUtcIso(data.timestamp);
    if (!timestamp) continue;
    if (data.tempC == null && data.airTempC == null && data.windSpeed == null) continue;

    byKey.set(`${buoy.name}|${timestamp}`, {
      buoyId: buoy.name,
      timestamp,
      tempC: data.tempC ?? null,
      tempF: data.tempF ?? null,
      airTempC: data.airTempC ?? null,
      airTempF: data.airTempF ?? null,
      windSpeed: data.windSpeed ?? null,
      precipitation: data.precipitation ?? null,
      humidity: data.humidity ?? null,
      dewpoint: data.dewpoint ?? null,
      precipitationProbability: null,
      lat: data.lat ?? null,
      lon: data.lon ?? null,
    });
  }

  return [...byKey.values()];
}

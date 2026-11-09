import { fetchKingCountyRaw } from "./buoy-api";
import { buoyDataFromKingCountyLine, parseBuoyLines, parseMapBuoyLine } from "./buoy-parse";
import { saveSnapshot } from "./history-store";

export const BACKGROUND_HISTORY_KEY = "backgroundHistoryEnabled";
export const BACKGROUND_HISTORY_LAST_RUN_KEY = "backgroundHistoryLastRunAt";
/** One King County fetch at most per hour while the setting is on. */
export const BACKGROUND_HISTORY_INTERVAL_MS = 60 * 60 * 1000;
/** How often to check whether the hourly window has elapsed (app must be open). */
export const BACKGROUND_HISTORY_CHECK_MS = 5 * 60 * 1000;

export type BackgroundCaptureResult = {
  saved: number;
  skipped: boolean;
  reason?: "disabled" | "offline" | "not-due" | "error";
};

export function isBackgroundHistoryEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(BACKGROUND_HISTORY_KEY) === "true";
}

export function setBackgroundHistoryEnabled(enabled: boolean): void {
  localStorage.setItem(BACKGROUND_HISTORY_KEY, enabled ? "true" : "false");
  if (!enabled) {
    localStorage.removeItem(BACKGROUND_HISTORY_LAST_RUN_KEY);
  }
}

export function getBackgroundHistoryLastRunAt(): number | null {
  const raw = localStorage.getItem(BACKGROUND_HISTORY_LAST_RUN_KEY);
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isBackgroundCaptureDue(now = Date.now()): boolean {
  if (!isBackgroundHistoryEnabled()) return false;
  const lastRun = getBackgroundHistoryLastRunAt();
  if (lastRun === null) return true;
  return now - lastRun >= BACKGROUND_HISTORY_INTERVAL_MS;
}

export function markBackgroundCaptureCompleted(at = Date.now()): void {
  localStorage.setItem(BACKGROUND_HISTORY_LAST_RUN_KEY, String(at));
}

/**
 * One network request to King County, then write snapshots for every known buoy locally.
 * Skips when disabled, offline, or already ran within the last hour.
 */
export async function runBackgroundHistoryCapture(
  fetchRaw: () => Promise<string> = fetchKingCountyRaw
): Promise<BackgroundCaptureResult> {
  if (!isBackgroundHistoryEnabled()) {
    return { saved: 0, skipped: true, reason: "disabled" };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { saved: 0, skipped: true, reason: "offline" };
  }
  if (!isBackgroundCaptureDue()) {
    return { saved: 0, skipped: true, reason: "not-due" };
  }

  try {
    const text = await fetchRaw();
    const lines = parseBuoyLines(text);
    let saved = 0;

    for (const line of lines) {
      const mapBuoy = parseMapBuoyLine(line);
      if (!mapBuoy) continue;
      const buoyData = buoyDataFromKingCountyLine(line, mapBuoy.name);
      if (!buoyData?.timestamp) continue;
      await saveSnapshot(mapBuoy.name, buoyData);
      saved++;
    }

    markBackgroundCaptureCompleted();
    return { saved, skipped: false };
  } catch (error) {
    console.error("[backgroundHistory] capture failed:", error);
    return { saved: 0, skipped: true, reason: "error" };
  }
}

import { syncHistory, type SyncResult } from "./sync";

export const BACKGROUND_HISTORY_KEY = "backgroundHistoryEnabled";
export const BACKGROUND_HISTORY_LAST_RUN_KEY = "backgroundHistoryLastRunAt";
/** Pull from the Worker at most once per hour while the setting is on. */
export const BACKGROUND_HISTORY_INTERVAL_MS = 60 * 60 * 1000;
/** How often to check whether the hourly window has elapsed (app must be open). */
export const BACKGROUND_HISTORY_CHECK_MS = 5 * 60 * 1000;

export type BackgroundCaptureResult = {
  saved: number;
  skipped: boolean;
  reason?: "disabled" | "offline" | "not-due" | "error";
  sync?: SyncResult;
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
 * Opt-in hourly catch-up: pull new D1 rows into this device's replica.
 * Skips when disabled, offline, or already ran within the last hour.
 * App-open / visibility sync still runs separately via `syncIfStale`.
 */
export async function runBackgroundHistoryCapture(
  sync: typeof syncHistory = syncHistory
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
    const result = await sync();
    if (!result.ok) {
      return { saved: result.changed, skipped: true, reason: "error", sync: result };
    }
    markBackgroundCaptureCompleted();
    return { saved: result.changed, skipped: false, sync: result };
  } catch (error) {
    console.error("[backgroundHistory] sync failed:", error);
    return { saved: 0, skipped: true, reason: "error" };
  }
}

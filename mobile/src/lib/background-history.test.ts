import { describe, expect, it, vi, beforeEach } from "vitest";
import { SAMPLE_KC_RESPONSE } from "../test/fixtures/king-county";
import {
  BACKGROUND_HISTORY_INTERVAL_MS,
  BACKGROUND_HISTORY_KEY,
  BACKGROUND_HISTORY_LAST_RUN_KEY,
  getBackgroundHistoryLastRunAt,
  isBackgroundCaptureDue,
  isBackgroundHistoryEnabled,
  runBackgroundHistoryCapture,
  setBackgroundHistoryEnabled,
} from "./background-history";
import { loadHistory, resetHistoryStoreForTests } from "./history-store";

describe("backgroundHistory preferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to disabled", () => {
    expect(isBackgroundHistoryEnabled()).toBe(false);
  });

  it("persists enabled flag", () => {
    setBackgroundHistoryEnabled(true);
    expect(localStorage.getItem(BACKGROUND_HISTORY_KEY)).toBe("true");
    expect(isBackgroundHistoryEnabled()).toBe(true);
  });

  it("clears last-run when disabled", () => {
    localStorage.setItem(BACKGROUND_HISTORY_LAST_RUN_KEY, String(Date.now()));
    setBackgroundHistoryEnabled(false);
    expect(getBackgroundHistoryLastRunAt()).toBeNull();
  });
});

describe("isBackgroundCaptureDue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is not due when disabled", () => {
    expect(isBackgroundCaptureDue()).toBe(false);
  });

  it("is due when enabled and never run", () => {
    setBackgroundHistoryEnabled(true);
    expect(isBackgroundCaptureDue()).toBe(true);
  });

  it("is not due within the hourly window", () => {
    setBackgroundHistoryEnabled(true);
    localStorage.setItem(BACKGROUND_HISTORY_LAST_RUN_KEY, String(Date.now()));
    expect(isBackgroundCaptureDue()).toBe(false);
  });

  it("is due after the hourly window", () => {
    setBackgroundHistoryEnabled(true);
    const past = Date.now() - BACKGROUND_HISTORY_INTERVAL_MS - 1;
    localStorage.setItem(BACKGROUND_HISTORY_LAST_RUN_KEY, String(past));
    expect(isBackgroundCaptureDue()).toBe(true);
  });
});

describe("runBackgroundHistoryCapture", () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetHistoryStoreForTests();
  });

  it("skips when disabled", async () => {
    const fetchRaw = vi.fn();
    const result = await runBackgroundHistoryCapture(fetchRaw);
    expect(result).toEqual({ saved: 0, skipped: true, reason: "disabled" });
    expect(fetchRaw).not.toHaveBeenCalled();
  });

  it("skips when not due", async () => {
    setBackgroundHistoryEnabled(true);
    localStorage.setItem(BACKGROUND_HISTORY_LAST_RUN_KEY, String(Date.now()));
    const fetchRaw = vi.fn();
    const result = await runBackgroundHistoryCapture(fetchRaw);
    expect(result).toEqual({ saved: 0, skipped: true, reason: "not-due" });
    expect(fetchRaw).not.toHaveBeenCalled();
  });

  it("saves snapshots from one King County response", async () => {
    setBackgroundHistoryEnabled(true);
    const fetchRaw = vi.fn().mockResolvedValue(SAMPLE_KC_RESPONSE);

    const result = await runBackgroundHistoryCapture(fetchRaw);

    expect(fetchRaw).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(false);
    expect(result.saved).toBeGreaterThan(0);

    const history = await loadHistory("Lake Sammamish");
    expect(history.length).toBeGreaterThan(0);
    expect(getBackgroundHistoryLastRunAt()).not.toBeNull();
  });
});

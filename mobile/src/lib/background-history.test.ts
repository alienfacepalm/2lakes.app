import { describe, expect, it, vi, beforeEach } from "vitest";
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
import { resetHistoryStoreForTests } from "./history-store";
import type { SyncResult } from "./sync";

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
    const sync = vi.fn();
    const result = await runBackgroundHistoryCapture(sync);
    expect(result).toEqual({ saved: 0, skipped: true, reason: "disabled" });
    expect(sync).not.toHaveBeenCalled();
  });

  it("skips when not due", async () => {
    setBackgroundHistoryEnabled(true);
    localStorage.setItem(BACKGROUND_HISTORY_LAST_RUN_KEY, String(Date.now()));
    const sync = vi.fn();
    const result = await runBackgroundHistoryCapture(sync);
    expect(result).toEqual({ saved: 0, skipped: true, reason: "not-due" });
    expect(sync).not.toHaveBeenCalled();
  });

  it("syncs from the Worker when enabled and due", async () => {
    setBackgroundHistoryEnabled(true);
    const ok: SyncResult = { ok: true, changed: 3, lastSeq: 9, pages: 1, reachedEnd: true };
    const sync = vi.fn().mockResolvedValue(ok);

    const result = await runBackgroundHistoryCapture(sync);

    expect(sync).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(false);
    expect(result.saved).toBe(3);
    expect(getBackgroundHistoryLastRunAt()).not.toBeNull();
  });

  it("does not mark complete when sync fails", async () => {
    setBackgroundHistoryEnabled(true);
    const fail: SyncResult = { ok: false, error: "network", changed: 0, lastSeq: 0 };
    const sync = vi.fn().mockResolvedValue(fail);

    const result = await runBackgroundHistoryCapture(sync);

    expect(result).toMatchObject({ skipped: true, reason: "error", saved: 0 });
    expect(getBackgroundHistoryLastRunAt()).toBeNull();
  });
});

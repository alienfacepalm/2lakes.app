import { afterEach, describe, expect, it, vi } from "vitest";
import { getDonateUrl, openDonatePage } from "./donate";

describe("getDonateUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when unset", () => {
    vi.stubEnv("VITE_DONATE_URL", "");
    expect(getDonateUrl()).toBeNull();
  });

  it("returns https URL when set", () => {
    vi.stubEnv("VITE_DONATE_URL", "https://ko-fi.com/example");
    expect(getDonateUrl()).toBe("https://ko-fi.com/example");
  });

  it("rejects invalid URLs", () => {
    vi.stubEnv("VITE_DONATE_URL", "not-a-url");
    expect(getDonateUrl()).toBeNull();
  });
});

describe("openDonatePage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("opens donate URL in a new tab", () => {
    vi.stubEnv("VITE_DONATE_URL", "https://ko-fi.com/example");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    expect(openDonatePage()).toBe(true);
    expect(open).toHaveBeenCalledWith("https://ko-fi.com/example", "_blank", "noopener,noreferrer");
  });

  it("returns false when URL is not configured", () => {
    vi.stubEnv("VITE_DONATE_URL", "");
    expect(openDonatePage()).toBe(false);
  });
});

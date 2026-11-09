import { describe, expect, it, vi } from "vitest";
import { isAppShell, isNativeApp, isStandalonePwa } from "./native-shell";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

describe("native-shell", () => {
  it("detects standalone display mode", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query.includes("standalone"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    expect(isStandalonePwa()).toBe(true);
    expect(isAppShell()).toBe(true);
    expect(isNativeApp()).toBe(false);
  });
});

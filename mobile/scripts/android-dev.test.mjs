import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEV_PORT, devServerUrl } from "./dev-port.mjs";
import { emulatorAppUrl, resolveAvdName, capacitorMainActivity } from "./android-dev.mjs";

describe("android-dev", () => {
  it("defaults to Pixel_3_API_33 when ANDROID_AVD is unset", () => {
    const prev = process.env.ANDROID_AVD;
    delete process.env.ANDROID_AVD;
    try {
      assert.equal(resolveAvdName(), "Pixel_3_API_33");
    } finally {
      if (prev === undefined) delete process.env.ANDROID_AVD;
      else process.env.ANDROID_AVD = prev;
    }
  });

  it("uses the same dev URL as the Vite server (adb reverse)", () => {
    assert.equal(emulatorAppUrl(), devServerUrl());
    assert.equal(emulatorAppUrl(DEV_PORT), "http://127.0.0.1:5173/");
  });

  it("targets the Capacitor main activity for the app shell", () => {
    assert.equal(capacitorMainActivity(), "app.twolakes.mobile/.MainActivity");
  });
});

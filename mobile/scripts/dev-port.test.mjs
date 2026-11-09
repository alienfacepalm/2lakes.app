import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEV_PORT, devServerUrl, resolveDevPort } from "./dev-port.mjs";

describe("dev-port", () => {
  it("uses port 5173 only", () => {
    assert.equal(resolveDevPort(), 5173);
    assert.equal(DEV_PORT, 5173);
  });

  it("builds the dev server URL", () => {
    assert.equal(devServerUrl(), "http://127.0.0.1:5173/");
  });
});

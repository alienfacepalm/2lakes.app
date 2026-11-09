import type { Page } from "@playwright/test";
import {
  SAMPLE_KC_RESPONSE,
  SAMPLE_NWS_ALERTS,
  SAMPLE_NWS_DAILY,
  SAMPLE_NWS_HOURLY,
  SAMPLE_NWS_POINT,
} from "../src/test/fixtures/king-county";

export async function mockBuoyApis(page: Page) {
  await page.route("**/api/kc**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: SAMPLE_KC_RESPONSE,
    });
  });

  await page.route("https://api.weather.gov/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/points/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SAMPLE_NWS_POINT) });
      return;
    }
    if (url.includes("forecast/hourly")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SAMPLE_NWS_HOURLY) });
      return;
    }
    if (url.includes("/forecast")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SAMPLE_NWS_DAILY) });
      return;
    }
    if (url.includes("/alerts/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SAMPLE_NWS_ALERTS) });
      return;
    }
    await route.continue();
  });
}

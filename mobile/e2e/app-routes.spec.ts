import { expect, test } from "@playwright/test";
import { mockBuoyApis } from "./fixtures";

test.describe("2lakes mobile routes", () => {
  test.beforeEach(async ({ page }) => {
    await mockBuoyApis(page);
  });

  test("dashboard loads buoy data from mocked APIs", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Lake Sammamish/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
  });

  test("history tab shows on-device history notice", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Lake Sammamish/i).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /history/i }).click();
    await expect(page.getByText("24h History")).toBeVisible();
    await expect(page.getByText(/On-Device History/i)).toBeVisible();
  });

  test("terms page is reachable", async ({ page }) => {
    await page.goto("/tos");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
    await expect(page.getByText("Last Revision:", { exact: false })).toBeVisible();
  });
});

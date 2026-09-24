import { expect, test } from "@playwright/test";

// Keep tests deterministic and offline: geocoding is stubbed per test.
test.beforeEach(async ({ page }) => {
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
});

async function ready(page, hash = "") {
  await page.goto(`/${hash}`);
  await expect(page.locator(".loader")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator("canvas")).toBeVisible();
}

test("loads the globe with country labels and the live counter", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.locator(".counter-num")).toHaveText("48,213");
  await expect(page.locator(".lbl-country").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("deep link opens a country panel with all its subdivisions", async ({ page }) => {
  await ready(page, "#/JPN");
  const panel = page.locator(".panel");
  await expect(panel.locator("h2")).toHaveText("Japan");
  await expect(panel.locator(".sec-head", { hasText: "Prefectures" })).toContainText("47");
  await expect(panel.locator(".stat", { hasText: "Capital" })).toContainText("Tokyo");
  await expect(panel.locator(".dream-mini")).toHaveCount(3);
});

test("drills from country to state and back up with Esc", async ({ page }) => {
  await ready(page, "#/USA");
  const panel = page.locator(".panel");
  await panel.locator(".mini-filter").fill("calif");
  await panel.locator(".row", { hasText: "California" }).click();
  await expect(panel.locator("h2")).toHaveText("California");
  await expect(panel.locator(".tag", { hasText: "US-CA" })).toBeVisible();
  await expect(panel.locator(".chip", { hasText: "Nevada" })).toBeVisible();
  await expect(page).toHaveURL(/#\/USA-3521$/);
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // move focus out of the filter
  await page.keyboard.press("Escape");
  await expect(panel.locator("h2")).toHaveText("United States of America");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("unknown deep links are ignored", async ({ page }) => {
  await ready(page, "#/NOPE-123");
  await expect(page.locator(".panel")).toHaveCount(0);
});

test("search: keyboard selection flies to a state", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("/");
  await page.keyboard.type("彰化縣");
  await expect(page.locator(".search-row").first()).toContainText("Changhua");
  await page.keyboard.press("Enter");
  await expect(page.locator(".panel h2")).toHaveText("Changhua");
  await expect(page.locator(".crumbs")).toContainText("Taiwan");
});

test("search still returns local results when geocoding is offline", async ({ page }) => {
  await page.unroute("https://geocoding-api.open-meteo.com/**");
  await page.route("https://geocoding-api.open-meteo.com/**", (route) => route.abort());
  await ready(page);
  await page.locator(".search-box input").fill("kaoh");
  await expect(page.locator(".search-row")).toHaveCount(4);
  await expect(page.locator(".search-icon.busy")).toHaveCount(0);
});

test("a slow stale geocode response never overwrites newer results", async ({ page }) => {
  await page.unroute("https://geocoding-api.open-meteo.com/**");
  await page.route("https://geocoding-api.open-meteo.com/**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("name");
    if (q === "par") await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({
      json: { results: [{ name: `Geo-${q}`, latitude: 1, longitude: 1, country: "Nowhere", country_code: "NW" }] },
    });
  });
  await ready(page);
  const input = page.locator(".search-box input");
  await input.fill("par");
  await page.waitForTimeout(400); // first request in flight
  await input.fill("paris");
  await expect(page.locator(".search-row", { hasText: "Geo-paris" })).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.locator(".search-row", { hasText: "Geo-par" }).filter({ hasNotText: "Geo-paris" })).toHaveCount(0);
});

test("pin a dream: modal shows the location and adds exactly one marker", async ({ page }) => {
  await ready(page);
  await page.locator(".cta").click();
  await expect(page.locator(".banner")).toBeVisible();
  await page.mouse.click(930, 380); // Sahara, in the home view
  const modal = page.locator(".modal");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".modal-coords")).toContainText("LAT");
  await expect(modal.locator(".modal-place")).toContainText("Algeria");
  await expect(page.locator(".tip")).toHaveCount(0); // hover tooltip cleared under the modal
  await modal.locator("input").fill("  Mira  ");
  await modal.locator("textarea").fill("x".repeat(500)); // maxLength clamps
  await expect(modal.locator("textarea")).toHaveValue("x".repeat(180));
  // Rapid double submit must not drop two dreams.
  await modal.locator(".btn-grad").dblclick();
  await expect(page.locator(".card .card-who")).toHaveText("Mira");
  await expect(page.locator(".counter-num")).toHaveText("48,214");
  await page.waitForTimeout(1500);
  await expect(page.locator(".counter-num")).toHaveText("48,214");
});

test("pinning over the ocean and cancelling leaves nothing behind", async ({ page }) => {
  await ready(page);
  await page.locator(".cta").click();
  await page.mouse.click(620, 520); // mid-Atlantic
  await expect(page.locator(".modal-place")).toContainText("open ocean");
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);
  await expect(page.locator(".counter-num")).toHaveText("48,213");
  await page.locator(".cta").click();
  await page.locator(".banner-cancel").click();
  await expect(page.locator(".banner")).toHaveCount(0);
});

test("clicking a country on the globe selects it", async ({ page }) => {
  await ready(page);
  await page.mouse.move(930, 380);
  await expect(page.locator(".tip")).toContainText("Algeria");
  await page.mouse.click(930, 380);
  await expect(page.locator(".panel h2")).toHaveText("Algeria");
});

test("tour starts, advances and stops on interaction", async ({ page }) => {
  await ready(page);
  await page.locator(".tour-btn").click();
  await expect(page.locator(".panel h2")).toHaveText("Japan");
  await expect(page.locator(".panel h2")).toHaveText("Tokyo", { timeout: 15_000 });
  await page.mouse.click(1300, 150);
  await expect(page.locator(".tour-btn")).toHaveText("▶ tour");
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("panel becomes a bottom sheet and hides the bottom controls", async ({ page }) => {
    await ready(page, "#/TWN");
    const box = await page.locator(".panel").boundingBox();
    expect(box.y + box.height).toBeGreaterThan(800);
    expect(box.width).toBeGreaterThan(360);
    await expect(page.locator(".bottom-left")).toBeHidden();
  });
});

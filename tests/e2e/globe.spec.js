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

test.describe("connecting dreams", () => {
  // The dream card bobs continuously (spec "floaty"), so it is never "stable"
  // for Playwright's actionability check — card buttons are clicked with force.
  async function openDream(page, name) {
    await page.locator(".search-box input").fill(name);
    await page.locator(".search-row", { hasText: `✦ ${name}` }).first().click();
  }

  test("sample dreams list their existing connections", async ({ page }) => {
    await ready(page);
    await openDream(page, "Mei");
    await expect(page.locator(".card-links-head")).toHaveText("Connected with 5");
    await page.locator(".card-links .chip", { hasText: "Yuki" }).click({ force: true });
    await expect(page.locator(".card-who")).toHaveText("Yuki, 19");
  });

  test("connect via search, then both cards list each other", async ({ page }) => {
    await ready(page);
    await openDream(page, "Kai");
    await page.locator(".card-connect").click({ force: true });
    await expect(page.locator(".banner-connect")).toContainText("Kai");
    await expect(page.locator(".card")).toHaveCount(0);
    await expect(page.locator(".bottom-left")).toHaveCount(0);
    await openDream(page, "Aroha");
    await expect(page.locator(".toast")).toHaveText("Connected Kai ↔ Aroha");
    await expect(page.locator(".banner-connect")).toHaveCount(0);
    await expect(page.locator(".card-who")).toHaveText("Aroha, 28");
    await expect(page.locator(".card-links .chip", { hasText: "Kai" })).toBeVisible();
    await openDream(page, "Kai");
    await expect(page.locator(".card-links .chip", { hasText: "Aroha" })).toBeVisible();
  });

  test("duplicates and self-links are refused without leaving connect mode", async ({ page }) => {
    await ready(page);
    await openDream(page, "Mei");
    await page.locator(".card-connect").click({ force: true });
    await openDream(page, "Yuki"); // already connected in the sample data
    await expect(page.locator(".toast")).toHaveText("Mei and Yuki are already connected");
    await openDream(page, "Mei");
    await expect(page.locator(".toast")).toHaveText("Pick a different dream to connect with");
    await expect(page.locator(".banner-connect")).toBeVisible();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    await expect(page.locator(".banner-connect")).toHaveCount(0);
    await expect(page.locator(".bottom-left")).toBeVisible();
  });

  test("clicking a marker on the globe completes the connection", async ({ page }) => {
    await ready(page);
    await openDream(page, "Kai");
    await page.locator(".card-connect").click({ force: true });
    // Centre Aoi's marker (Sapporo) on screen, then click it.
    await page.evaluate(() => window.DreamGlobe.flyTo(43.062, 141.354));
    // The flight's length depends on frame rate (slow under software WebGL), so
    // keep nudging the pointer until the hover resolves on Aoi's marker.
    let x = 720;
    await expect
      .poll(
        async () => {
          x = x === 720 ? 721 : 720;
          await page.mouse.move(x, 450);
          await page.waitForTimeout(400);
          return (await page.locator(".tip").allTextContents()).join(" ");
        },
        { timeout: 30_000 },
      )
      .toContain("Connect with Aoi");
    await page.mouse.click(x, 450);
    await expect(page.locator(".toast")).toHaveText("Connected Kai ↔ Aoi");
    await expect(page.locator(".card-who")).toHaveText("Aoi, 26");
  });

  test("clicking the globe itself does nothing while connecting", async ({ page }) => {
    await ready(page);
    await openDream(page, "Kai");
    await page.locator(".card-connect").click({ force: true });
    await page.evaluate(() => window.DreamGlobe.flyTo(0, -30)); // open Atlantic
    await page.waitForTimeout(2500);
    await page.mouse.click(720, 450);
    await expect(page.locator(".banner-connect")).toBeVisible();
    await expect(page.locator(".panel")).toHaveCount(0);
    await expect(page.locator(".toast")).toHaveCount(0);
  });

  test("pinning cancels connect mode and a new pin can be connected", async ({ page }) => {
    await ready(page);
    await openDream(page, "Kai");
    await page.locator(".card-connect").click({ force: true });
    await page.keyboard.press("Escape");
    await page.locator(".cta").click();
    await page.mouse.click(930, 380);
    await page.locator(".modal input").fill("Nova");
    await page.locator(".btn-grad").click();
    await expect(page.locator(".card-who")).toHaveText("Nova");
    await page.locator(".card-connect").click({ force: true });
    await openDream(page, "Salma");
    await expect(page.locator(".toast")).toHaveText("Connected Nova ↔ Salma");
  });

  test("public API: addArc validates input and updates the card", async ({ page }) => {
    await ready(page);
    const r = await page.evaluate(() => {
      const g = window.DreamGlobe;
      const nova = g.addMarker(10, 10, { name: "Nova", city: "X", country: "Y", text: "t" });
      return [g.addArc(nova, 0), g.addArc(0, nova), g.addArc(0, 0), g.addArc(0, 9999), g.addArc({ lat: 1 }, 0)];
    });
    expect(r).toEqual([
      { ok: true },
      { ok: false, reason: "duplicate" },
      { ok: false, reason: "same" },
      { ok: false, reason: "missing" },
      { ok: false, reason: "missing" },
    ]);
    await openDream(page, "Aïsha");
    await expect(page.locator(".card-links .chip", { hasText: "Nova" })).toBeVisible();
  });
});

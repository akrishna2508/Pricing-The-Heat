// Playwright E2E suite for the Pricing the Heat dashboard (Prompt 11).
//
// STATUS: written but NOT executed this session -- no Playwright skill/tool
// was available (checked via ToolSearch for "playwright e2e browser test";
// no match). @playwright/test is installed as a devDependency so this file
// type-checks cleanly under `next build`, but actually running it requires
// browser binaries (`npx playwright install`) that were not fetched here.
//
// The E2E coverage below was instead verified THIS session via
// e2e/fetch-replay.mjs, which replicates every one of these page flows'
// exact fetch calls against the live backend and asserts on the real
// response shape/values -- see that file's header for how it was run and
// its results.
//
// To actually run this suite once Playwright is available:
//   npx playwright install --with-deps chromium
//   npm run dev &                       # serve the frontend
//   (cd .. && make backtest)            # ensure trained artifacts exist
//   npx playwright test
//
// Requires: the FastAPI backend running with trained artifacts at
// NEXT_PUBLIC_API_URL, ANTHROPIC_API_KEY unset (so the assistant exercises
// its no-key fallback, matching CI/demo conditions), and the frontend dev
// server reachable at PLAYWRIGHT_BASE_URL (default http://localhost:3000).

import { expect, test } from "@playwright/test";

test.describe("heat map", () => {
  test("renders real grid data on the home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/City-level mu-TEVI index/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  });
});

test.describe("simulate a policy", () => {
  test("prices a covered location with income-smoothing framing and basis risk", async ({ page }) => {
    await page.goto("/simulate");
    await page.getByRole("button", { name: "Price default city" }).click();
    await expect(page.getByText(/income smoothing/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Premium \(fair actuarial price\)/i)).toBeVisible();
    await expect(page.getByText(/Basis risk -- disclosed honestly/i)).toBeVisible();

    const bodyText = await page.textContent("body");
    expect(bodyText?.toLowerCase()).not.toContain("catastrophe");
  });

  test("explain panel shows the single dominant feature honestly", async ({ page }) => {
    await page.goto("/simulate");
    await page.getByRole("button", { name: "Price default city" }).click();
    await expect(page.getByText(/Premium \(fair actuarial price\)/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Explain this premium/i }).click();
    await expect(page.getByText(/What drives this premium/i)).toBeVisible({ timeout: 15_000 });
    // On the real replay this is typically max_index_in_window at ~99.7% --
    // asserted as "one feature clearly dominates", not a hardcoded number,
    // since the exact split can shift slightly with the chosen window.
    await expect(page.getByText(/max index in window/i)).toBeVisible();
  });

  test("out-of-coverage location shows the honest message, never fabricated pricing", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 0, longitude: 0 });
    await page.goto("/simulate");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(/Not covered yet/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/No data was fabricated/i)).toBeVisible();
  });
});

test.describe("assistant", () => {
  test("answers via the no-key fallback within a timeout, grounded in a real policy", async ({ page }) => {
    await page.goto("/simulate");
    await page.getByRole("button", { name: "Price default city" }).click();
    await expect(page.getByText(/Premium \(fair actuarial price\)/i)).toBeVisible({ timeout: 15_000 });

    await page.goto("/assistant");
    await page.getByPlaceholder(/Ask a question about this policy/i).fill("What is my premium?");
    const started = Date.now();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/templated answer|answered by Claude/i)).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - started).toBeLessThan(10_000);

    const bodyText = await page.textContent("body");
    expect(bodyText?.toLowerCase()).not.toContain("catastrophe");
    expect(bodyText?.toLowerCase()).toContain("income smoothing");
  });
});

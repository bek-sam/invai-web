import { expect, type Page, test } from "@playwright/test";
import { OWNER } from "./helpers/api";
import { loginAs, settled, watchPage } from "./helpers/ui";

/*
 * Wave 20 acceptance tests for T-20-2 (web digest copy, permission errors and number format),
 * written from `invai-docs/waves/20/T-20-2.md` and the wording rule in `invai-docs/waves/20/wave.md`
 * before the build (`acceptance-tests-first`). Runs against the seeded stack: `owner@desertbloom.test`
 * already has a `2026-W39` digest (built by the worker's own sweep on this Monday) and is on the
 * "growth" plan (`ordersPerMonth: 10000`).
 *
 * The heading bug (AC1, gate issue 2) traces to `invai-web/src/lib/format.ts`'s `formatDay()`,
 * which calls `toLocaleDateString(undefined, ...)` -- the runtime's default locale, never the app's
 * i18n language -- and that file is *not* in T-20-2's owned paths
 * (`src/components/digest/**`, `src/routes/_app/digests/**`, `src/lib/errors.ts`,
 * `src/i18n/{en,es}.ts`). T-20-2 can still fix AC1 without touching `format.ts`: stop calling
 * `formatDay` from the owned route files and build the date label with a lang-aware `Intl` call
 * instead (the pattern `components/digest/digest-copy.ts`'s `weekdayLabel`/`hourLabel` already
 * use). Flagged in the QA report so the implementer doesn't try to edit a file it doesn't own.
 *
 * AC2 (points/unchanged on the glance grid) is covered below by locating each StatCard through its
 * label rather than a forced before/after pair -- see that describe block's own comment.
 *
 * Owner: qa-engineer. Implementers don't edit this file; disagreements go in their report.
 */

const EN_WEEKDAY_OR_MONTH =
  /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
const ES_WEEKDAY_OR_MONTH =
  /\b(lun|mar|mié|jue|vie|sáb|dom|ene|feb|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/i;

test.describe("AC1 (T-20-2): the Spanish digest heading never shows an English weekday or month", () => {
  test("digest list row and detail page heading, es, 390px", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
    await page.setViewportSize({ width: 390, height: 844 });
    const issues = watchPage(page);
    await loginAs(page, OWNER);
    await page.goto("/digests");
    await settled(page);

    const rows = page.locator('a[href^="/digests/"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const listHeading = (await rows.first().innerText()).trim();
    expect(listHeading).not.toMatch(EN_WEEKDAY_OR_MONTH);
    expect(listHeading).toMatch(ES_WEEKDAY_OR_MONTH);

    await rows.first().click();
    await settled(page);
    const pageHeading = (await page.locator("h1").first().innerText()).trim();
    expect(pageHeading).not.toMatch(EN_WEEKDAY_OR_MONTH);
    expect(pageHeading).toMatch(ES_WEEKDAY_OR_MONTH);
    expect(issues.filter((i) => i.kind === "console")).toEqual([]);
  });
});

/**
 * AC2 (T-20-2): margin and on-time deltas render in points ("+6.9 pts") or "unchanged", never the
 * old relative-percent wording, and "unchanged" carries no arrow. Rather than forcing a specific
 * before/after pair through the real digest pipeline (which QA's owned paths can't seed directly --
 * `digest.get` only, no DB backdoor from `invai-web/e2e`), this locates the metric's own StatCard by
 * its label and reads its delta paragraph, so the assertion holds for whatever the seeded week's
 * real margin/on-time change is: a point value must end in "pts" (never "%", the wave-19 bug), and
 * literal "unchanged"/"sin cambio" text must carry no arrow icon (`StatCard`'s `deltaDirection`
 * defaults to "up" whenever `delta` is a truthy string -- `invai-ui/src/app/stat-card.tsx:41` -- so
 * today's `glance-grid.tsx` shows a green up arrow next to "unchanged", which this pins as wrong).
 */
async function deltaFor(page: Page, label: RegExp) {
  const card = page
    .locator("p", { hasText: label })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(card).toBeVisible({ timeout: 15_000 });
  const deltaP = card.locator("p").nth(2);
  if ((await deltaP.count()) === 0) return null;
  return { text: (await deltaP.innerText()).trim(), arrows: await deltaP.locator("svg").count() };
}

test.describe("AC2 (T-20-2): margin and on-time deltas are points or 'unchanged', with no arrow when unchanged", () => {
  test("English: Margin and On-time rate", async ({ page }) => {
    const issues = watchPage(page);
    await loginAs(page, OWNER);
    await page.goto("/digests");
    await settled(page);
    const rows = page.locator('a[href^="/digests/"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await rows.first().click();
    await settled(page);

    for (const label of [/^Margin$/, /^On-time rate$/]) {
      const delta = await deltaFor(page, label);
      expect(delta, `expected a change delta for ${label}`).not.toBeNull();
      if (!delta) continue;
      expect(delta.text).toMatch(/pts$|^unchanged$/i);
      expect(delta.text).not.toMatch(/%/);
      if (/^unchanged$/i.test(delta.text)) expect(delta.arrows).toBe(0);
    }
    expect(issues).toEqual([]);
  });

  test("Spanish: Margen and Tasa de puntualidad", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
    const issues = watchPage(page);
    await loginAs(page, OWNER);
    await page.goto("/digests");
    await settled(page);
    const rows = page.locator('a[href^="/digests/"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await rows.first().click();
    await settled(page);

    for (const label of [/^Margen$/, /^Tasa de puntualidad$/]) {
      const delta = await deltaFor(page, label);
      expect(delta, `expected a change delta for ${label}`).not.toBeNull();
      if (!delta) continue;
      expect(delta.text).toMatch(/pts$|^sin cambio$/i);
      expect(delta.text).not.toMatch(/%/);
      if (/^sin cambio$/i.test(delta.text)) expect(delta.arrows).toBe(0);
    }
    expect(issues).toEqual([]);
  });
});

test.describe("AC3 (T-20-2): office@ sees a translated no-access message, never the raw permission string", () => {
  test("Settings -> Notifications, English", async ({ page }) => {
    await loginAs(page, { email: "office@desertbloom.test", password: "demo1234!" });
    await page.goto("/settings/notifications");
    await settled(page);
    await expect(
      page.getByText(/You don't have access to this page\. Ask the owner\./i),
    ).toBeVisible({ timeout: 15_000 });
    // The bug this replaces: the raw backend string, verbatim and untranslated.
    await expect(page.getByText(/Missing permission/i)).toHaveCount(0);
  });

  test("Settings -> Notifications, Spanish", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
    await loginAs(page, { email: "office@desertbloom.test", password: "demo1234!" });
    await page.goto("/settings/notifications");
    await settled(page);
    await expect(
      page.getByText(/No tienes acceso a esta página\. Pídeselo al dueño\./i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Missing permission/i)).toHaveCount(0);
  });
});

test.describe("AC4 (T-20-2): plan usage renders limits with the locale's thousands separator", () => {
  test("English: the growth plan's 10,000 orders/mo limit shows a comma", async ({ page }) => {
    await loginAs(page, OWNER);
    await page.goto("/settings/billing");
    await settled(page);
    await expect(page.getByText("10,000", { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Spanish: the same limit shows a period, not a comma (10.000, not 10,000)", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
    await loginAs(page, OWNER);
    await page.goto("/settings/billing");
    await settled(page);
    await expect(page.getByText("10.000", { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("10,000", { exact: false })).toHaveCount(0);
  });
});

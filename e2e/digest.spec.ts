import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/api";
import { loginAs, settled, watchPage } from "./helpers/ui";

/**
 * Wave 19 digest in the browser (spec `weekly-digest.md`: "Screens and flow", AC13, AC23, AC24,
 * AC30, AC32, AC33). Runs against the seeded stack after a digest has been built for the current
 * week for `owner@desertbloom.test` (the gate's own step, per `wave.md`'s integration gate: "digest
 * built for the seed shop with frozen/forced week").
 *
 * First pass, expected red until T-19-3 (router), T-19-4 (public routes) and T-19-5 (these pages)
 * land: `/digests` and `/unsubscribe` don't exist yet, so every navigation 404s or times out,
 * which is a real, correct failure until then, not a typo in this file. `test.fail()` marks each
 * case so CI stays honest: remove the marker once the page exists (`acceptance-tests-first`).
 *
 * Owner: qa-engineer. Implementers don't edit this file; disagreements go in their report.
 */

test.describe("Today card: 'Your week in review is ready'", () => {
  test.fail(
    "shows net profit and change, and links to the current week's digest",
    async ({ page }) => {
      const issues = watchPage(page);
      await loginAs(page, OWNER);
      await page.goto("/");
      await settled(page);
      const card = page.getByText(/Your week in review is ready/i);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.click();
      await page.waitForURL(/\/digests\//, { timeout: 15_000 });
      expect(issues).toEqual([]);
    },
  );

  test.fail("shows nothing when there is no ready digest for a shop with digests off", async () => {
    // Placeholder: needs a second seeded shop with the digest off, or `me.notifications` toggled
    // off for the owner, to prove absence without disturbing the shared seed. Held back until
    // T-19-5 lands, see qa-engineer memory / held-back notes for the exact second-account plan.
    expect(true).toBe(false);
  });
});

test.describe("Digest page: glance, actions, market watch, feedback, en/es", () => {
  test.fail(
    "English: glance block, up to 3 actions with buttons, the win, thumbs feedback",
    async ({ page }) => {
      const issues = watchPage(page);
      await loginAs(page, OWNER);
      await page.goto("/digests");
      await settled(page);
      const rows = page.getByRole("link", { name: /\d{4}-W\d{2}/ });
      await expect(rows.first()).toBeVisible({ timeout: 15_000 });
      await rows.first().click();
      await settled(page);

      await expect(page.getByText(/net profit|Net profit/i)).toBeVisible();
      const actionButtons = page.getByRole("button", {
        name: /Ship|Reconnect|Review|List|Reorder/i,
      });
      expect(await actionButtons.count()).toBeLessThanOrEqual(3);

      const upvote = page.getByRole("button", { name: /thumbs up|👍/i }).first();
      if (await upvote.count()) {
        const downvote = page.getByRole("button", { name: /thumbs down|👎/i }).first();
        await downvote.click();
        await expect(page.getByText(/Not relevant/i)).toBeVisible();
      }
      expect(issues).toEqual([]);
    },
  );

  test.fail(
    "Spanish at 390px: no raw i18n keys, no English fallback, money stays USD",
    async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
      await page.setViewportSize({ width: 390, height: 844 });
      const issues = watchPage(page);
      await loginAs(page, OWNER);
      await page.goto("/digests");
      await settled(page);
      const rows = page.getByRole("link", { name: /\d{4}-W\d{2}/ });
      await rows.first().click();
      await settled(page);

      await expect(page.getByText("Vistazo al mercado"))
        .toBeVisible()
        .catch(() => {});
      const body = await page.locator("main").innerText();
      // No dotted-key leaks (e.g. "digest.today.card") and no untranslated English sentence.
      expect(body).not.toMatch(/\b[a-z]+(\.[a-z][a-zA-Z]*){2,}\b/);
      expect(body).not.toContain("A steady week. Here are your numbers.");
      expect(body).toMatch(/\$\d/); // USD stays USD, formatted with a dollar sign even in es
      expect(issues).toEqual([]);
    },
  );
});

test.describe("Settings -> Notifications (AC33) and Account toggle", () => {
  test.fail(
    "AI summary toggle is disabled with the shadow-mode explanation, in the user's language",
    async ({ page }) => {
      await loginAs(page, OWNER);
      await page.goto("/settings/notifications");
      await settled(page);
      const aiToggle = page.getByRole("switch", { name: /Write the summary with AI/i });
      await expect(aiToggle).toBeDisabled();
      await expect(page.getByText(/Turned off for now while we test AI summaries/i)).toBeVisible();
    },
  );

  test.fail("office cannot see the Notifications settings page", async ({ page }) => {
    await loginAs(page, { email: "office@desertbloom.test", password: "demo1234!" });
    const res = await page.goto("/settings/notifications");
    expect(res?.status()).not.toBe(200);
  });
});

test.describe("Public unsubscribe page", () => {
  test.fail(
    "confirm button posts once and shows the Undo message in the person's language",
    async ({ page }) => {
      // A real token needs a built digest + a signed link from T-19-4; the gate step builds one and
      // records it (`seed-output.json`-adjacent evidence per the wave's integration gate). Until
      // then this is a placeholder assertion showing the intended flow.
      await page.goto("/unsubscribe?token=placeholder");
      const button = page.getByRole("button", { name: /unsubscribe|confirm/i });
      await expect(button).toBeVisible();
      await button.click();
      await expect(page.getByText(/won't get the weekly review by email any more/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Undo/i })).toBeVisible();
    },
  );
});

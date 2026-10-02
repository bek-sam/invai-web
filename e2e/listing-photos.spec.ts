import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/ui";

/*
 * T-26-5 "Listing photos" screen, phase A (spec `listing-photos.md`, card `waves/26/T-26-5.md`).
 * Written from the card's acceptance criteria before the web screen exists (acceptance-tests-
 * first): expected red until T-26-5 lands the route and components. Role/text selectors use the
 * card's own wording in English; the web-engineer's route is named `/listing-photos` in the card
 * handoff (next to `/listings/drafts` in nav.ts) — this spec assumes that path.
 *
 * Flow: pick a seeded design, wait for analysis, choose tee + hoodie, white + black, front_flat +
 * on_model_white, channels amazon + etsy, generate, wait for ready, approve all passing, see the
 * zip link, attach to an AI listing draft.
 */

const DESIGNER = { email: "designer@desertbloom.test", password: "demo1234!" };

test.describe.configure({ mode: "serial" });

test("a designer runs the full listing-photos flow for a design (AC1-6)", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page, DESIGNER);

  // AC1: nav entry next to AI listings, for office/designer/owner/admin.
  await page.getByRole("link", { name: "Listing photos" }).click();
  await page.waitForURL(/\/listing-photos/);

  // Step 1: pick a design (searchable list with thumbnails).
  const search = page.getByRole("searchbox");
  await expect(search).toBeVisible();
  const firstDesign = page.getByRole("button", { name: /^Select / }).first();
  await expect(firstDesign).toBeVisible();
  await firstDesign.click();

  // Step 2: analysis — polls until ready; shows style/audience, recommended colors, contrast
  // warnings in plain words. A mock analysis is labelled as sample.
  await expect(page.getByText(/Analyzing|Sample analysis/)).toBeVisible();
  await expect(page.getByText("Sample", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Recommended colors" })).toBeVisible();

  // Step 3: choose garments, colors, views, channels; a live credits estimate.
  await page.getByRole("checkbox", { name: "Tee" }).check();
  await page.getByRole("checkbox", { name: "Hoodie" }).check();
  await page.getByRole("checkbox", { name: "White" }).check();
  await page.getByRole("checkbox", { name: "Black" }).check();
  await page.getByRole("checkbox", { name: "Front flat" }).check();
  await page.getByRole("checkbox", { name: "On model (white)" }).check();
  await page.getByRole("checkbox", { name: "Amazon" }).check();
  await page.getByRole("checkbox", { name: "Etsy" }).check();
  await expect(page.getByText(/\d+ photos?, \d+ credits?/)).toBeVisible();

  const generate = page.getByRole("button", { name: "Generate" });
  await expect(generate).toBeEnabled();
  await generate.click();

  // Step 4: results grid, grouped by channel and slot, updating until ready (poll/realtime).
  await expect(page.getByRole("heading", { name: "Amazon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Etsy" })).toBeVisible();
  await expect
    .poll(async () => (await page.getByText(/Rendering|Queued/).count()) === 0, {
      timeout: 60_000,
    })
    .toBe(true);

  // Approve: "approve all passing" first (per card AC6), then individual approvals if needed.
  await page.getByRole("button", { name: "Approve all passing" }).click();
  await expect(page.getByRole("button", { name: /^Approve$/ }).first()).toBeHidden({
    timeout: 10_000,
  });

  // Download zip appears once approvals exist and the zip job finishes.
  const zipLink = page.getByRole("link", { name: "Download zip" });
  await expect(zipLink).toBeVisible({ timeout: 30_000 });
  await expect(zipLink).toHaveAttribute("href", /^https?:\/\//);

  // Attach to an AI listing draft of the same design; confirmation names the count.
  await page.getByRole("button", { name: "Attach to AI listing draft" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Attach" }).click();
  await expect(page.getByText(/Attached \d+ photos? to the draft/)).toBeVisible();
});

test("an unapproved image can't be downloaded or attached, and the UI says why (AC6)", async ({
  page,
}) => {
  await loginAs(page, DESIGNER);
  await page.goto("/listing-photos");
  const existingSet = page.getByRole("link", { name: /^Open / }).first();
  await existingSet.click();
  const attach = page.getByRole("button", { name: "Attach to AI listing draft" });
  if ((await page.getByRole("button", { name: /^Reject$/ }).count()) > 0) {
    await page
      .getByRole("button", { name: /^Reject$/ })
      .first()
      .click();
  }
  await expect(page.getByText(/still needs? approval|Approve .* first/)).toBeVisible();
  await expect(attach).toBeDisabled();
});

const PRESSER = { email: "presser@desertbloom.test", password: "demo1234!" };

test("a presser has no nav entry and the route shows the no-access page (spec AC14)", async ({
  page,
}) => {
  await loginAs(page, PRESSER);
  await expect(page.getByRole("link", { name: "Listing photos" })).toHaveCount(0);
  await page.goto("/listing-photos");
  await expect(page.getByText(/don't have access|no access|not authorized/i)).toBeVisible();
});

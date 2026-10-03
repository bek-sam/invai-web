import { expect, test } from "@playwright/test";
import { poll, signIn } from "./helpers/api";
import { loginAs } from "./helpers/ui";

/*
 * T-26-5 "Listing photos" screen, phase A (spec `listing-photos.md`, card `waves/26/T-26-5.md`).
 * Written from the card's acceptance criteria before the web screen existed (acceptance-tests-
 * first), then re-synced to the built route's labels after T-26-5 landed (web commit 66ab0cb):
 * accessible names use `exact: true` where a short name is a substring of another control's name
 * (e.g. the "White" color checkbox vs. the "On model (white)" view checkbox), and the second test
 * builds its own fresh, never-approved set rather than assuming one exists in `Recent sets`.
 *
 * Flow: pick a seeded design, wait for analysis, choose tee + hoodie, white + black, front_flat +
 * on_model_white, channels amazon + etsy, generate, wait for ready, approve all passing, see the
 * zip link, attach to an AI listing draft.
 *
 * Gate run-20261002T235910Z found that step's dialog depends on an AI listing draft already
 * existing for the design, which a plain fresh seed doesn't have ("No AI listing drafts for this
 * design yet.") -- correct product behavior, not a bug. The test now creates a matching draft
 * itself through the API (same designer session, `ai.listings.create`), picking whichever
 * channel actually has an approved image in this run rather than assuming "etsy" or "amazon"
 * passes its checks, so the fix doesn't quietly depend on today's mock-check outcome either.
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

  // Selecting a design navigates to ?designId=...; capture it now, before "Generate" replaces
  // the search params with ?setId=..., so the AI listing draft created below targets the same
  // design this flow is building photos for.
  const designId = new URL(page.url()).searchParams.get("designId");
  if (!designId) throw new Error("expected ?designId= in the URL after selecting a design");

  // Step 2: analysis — polls until ready; shows style/audience, recommended colors, contrast
  // warnings in plain words. A mock analysis is labelled as sample.
  await expect(page.getByText(/Analyzing|Sample analysis/)).toBeVisible();
  await expect(page.getByText("Sample", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Recommended colors" })).toBeVisible();

  // Step 3: choose garments, colors, views, channels; a live credits estimate.
  // exact: true throughout -- Playwright's accessible-name match is substring by default, and
  // "White" (a color checkbox) is a substring of the view checkbox "On model (white)".
  await page.getByRole("checkbox", { name: "Tee", exact: true }).check();
  await page.getByRole("checkbox", { name: "Hoodie", exact: true }).check();
  await page.getByRole("checkbox", { name: "White", exact: true }).check();
  await page.getByRole("checkbox", { name: "Black", exact: true }).check();
  await page.getByRole("checkbox", { name: "Front flat", exact: true }).check();
  await page.getByRole("checkbox", { name: "On model (white)", exact: true }).check();
  await page.getByRole("checkbox", { name: "Amazon", exact: true }).check();
  await page.getByRole("checkbox", { name: "Etsy", exact: true }).check();
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
  // Only images that pass every check turn into "Approved" and lose their Approve button; a
  // card with a check failure or warning (e.g. the Amazon main or hoodie images in this flow)
  // keeps its own Approve/Reject buttons on purpose, per card AC6 ("approve single images or
  // all passing ones") -- so this doesn't assert every Approve button disappears.
  const approveButtons = page.getByRole("button", { name: /^Approve$/ });
  const approveCountBefore = await approveButtons.count();
  await page.getByRole("button", { name: "Approve all passing" }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(async () => approveButtons.count(), { timeout: 10_000 })
    .toBeLessThan(approveCountBefore);

  // Download zip appears once approvals exist and the zip job finishes.
  const zipLink = page.getByRole("link", { name: "Download zip" });
  await expect(zipLink).toBeVisible({ timeout: 30_000 });
  await expect(zipLink).toHaveAttribute("href", /^https?:\/\//);

  // Attach to an AI listing draft of the same design; confirmation names the count. The dialog
  // lists drafts for this design but has none on a fresh seed, so create one here first, through
  // the API as the same designer -- a channel that actually has an approved image in this run
  // (the comment above already says Amazon images are the ones likely to carry a check issue),
  // so "Attach" has something real to match and the final count assertion isn't trivially 0.
  const setId = new URL(page.url()).searchParams.get("setId");
  if (!setId) throw new Error("expected ?setId= in the URL after generating a set");
  const api = (await signIn(DESIGNER.email, DESIGNER.password)).api;
  const photoSet = await poll(
    () => api.photos.getSet({ id: setId }),
    (s) => s.images.some((i) => i.status === "approved"),
    { label: "an approved image in the set" },
  );
  const draftChannel = photoSet.images.find((i) => i.status === "approved")?.channel;
  if (!draftChannel) throw new Error("no approved image to pick a matching draft channel from");
  const createdDraft = await api.ai.listings.create({
    designId,
    channels: [draftChannel],
    batch: false,
  });
  await poll(
    () => api.ai.listings.get({ id: createdDraft.drafts[0]?.id as string }),
    (d) => d.status !== "generating",
    { label: "the new listing draft" },
  );

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
  test.setTimeout(90_000);
  await loginAs(page, DESIGNER);
  await page.goto("/listing-photos");

  // Build a fresh, never-approved set instead of opening an existing one (`Recent sets`): on a
  // freshly seeded database there may be no sets yet, and on a used database the most recent one
  // may already be fully approved (e.g. by the test above), so either way the old assumption that
  // *some* unapproved set exists wasn't safe. The create mutation's idempotency key is a fresh
  // crypto.randomUUID() per page load (see the route's `idemRef`), so this always makes its own
  // new set even when it reuses the same design and options as another test.
  const search = page.getByRole("searchbox");
  await expect(search).toBeVisible();
  const firstDesign = page.getByRole("button", { name: /^Select / }).first();
  await expect(firstDesign).toBeVisible();
  await firstDesign.click();

  await expect(page.getByText(/Analyzing|Sample analysis/)).toBeVisible();
  await expect(page.getByText("Sample", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Recommended colors" })).toBeVisible();

  await page.getByRole("checkbox", { name: "Tee", exact: true }).check();
  await page.getByRole("checkbox", { name: "White", exact: true }).check();
  await page.getByRole("checkbox", { name: "Front flat", exact: true }).check();
  await page.getByRole("checkbox", { name: "Amazon", exact: true }).check();

  const generate = page.getByRole("button", { name: "Generate" });
  await expect(generate).toBeEnabled();
  await generate.click();

  await expect
    .poll(async () => (await page.getByText(/Rendering|Queued/).count()) === 0, {
      timeout: 60_000,
    })
    .toBe(true);

  // Nothing was approved, so download and attach must both say so and stay blocked.
  const attach = page.getByRole("button", { name: "Attach to AI listing draft" });
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
  // The shared FORBIDDEN ErrorState renders both a title ("No access") and a description ("You
  // don't have access...") that each match a loose "no access" / "don't have access" regex, so a
  // single such matcher hits two elements (strict-mode violation). Match the title text exactly.
  await expect(page.getByText("No access", { exact: true })).toBeVisible();
});

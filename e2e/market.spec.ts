import { expect, type Locator, type Page, test } from "@playwright/test";
import { OWNER, type Session, signIn } from "./helpers/api";
import { loginAs, settled, watchPage } from "./helpers/ui";

/**
 * Wave 18 market signals in the browser (spec `market-signals.md`: User flow, AC2, AC15, AC30,
 * AC32, AC33). Runs against the seeded stack after the market jobs ran (the gate's "market jobs
 * run on the fresh seed" step). First pass, expected red until T-18-3, T-18-4 and T-18-5 land.
 *
 * Hooks the web must expose (T-18-5), so the flow is testable without scraping prose:
 * - tool chips show the `chip.*` copy inside the message ("Market trend" / "Tendencia del mercado");
 * - the "Sample data" / "Datos de muestra" badge is visible text, not a tooltip;
 * - vote buttons are `role=button` whose accessible name ends with the vote word ("… done",
 *   "… not useful"; es "… hecho", "… no me sirve") and carry `aria-pressed` for the stored state;
 * - the niche chip's "Change" / "Cambiar" button opens a `role=dialog` with a `role=combobox`
 *   search field whose `role=option`s carry the niche labels; "Save" / "Guardar" commits.
 */

const DESIGNER = { email: "designer@desertbloom.test", password: "demo1234!" };
const STARTERS_EN = [
  "Which of my designs are trending?",
  "Am I priced right on Amazon?",
  "When should I get ready for the holidays?",
];

const main = (page: Page) => page.locator("main");
const doneButtons = (scope: Locator) => scope.getByRole("button", { name: /done$/i });
const notUsefulButtons = (scope: Locator) => scope.getByRole("button", { name: /not useful$/i });

/** Sends a question and waits for the stream to finish (Send re-enabled, no spinner). */
async function askStarter(page: Page, text: string) {
  await page.getByRole("button", { name: text }).click();
  await expect(main(page)).toContainText(text);
  await expect.poll(() => page.locator("main .animate-spin").count(), { timeout: 45_000 }).toBe(0);
  await expect(page.getByRole("button", { name: /^(Send|Enviar)$/ })).toBeEnabled();
}

/** Asks the starters in turn until an answer carries vote cards; the seed must yield at least one. */
async function firstAnswerWithVotes(page: Page): Promise<string> {
  for (const s of STARTERS_EN) {
    await askStarter(page, s);
    if ((await notUsefulButtons(main(page)).count()) > 0) return s;
    await page.getByRole("button", { name: /^(New chat|Chat nuevo)$/ }).click();
  }
  throw new Error(
    "no starter question produced a recommendation on the seed: a seed-realism gap for T-18-3 / backend-foundation",
  );
}

test.describe.configure({ mode: "serial" });

test("market chips, the Sample data badge and vote cards render from the stream (AC2, AC30)", async ({
  page,
}) => {
  await loginAs(page);
  const issues = watchPage(page);
  await page.goto("/assistant");
  await settled(page);
  await askStarter(page, STARTERS_EN[0] ?? "");
  const m = main(page);
  await expect(m.getByText("Market trend").first()).toBeVisible();
  await expect(m.getByText("Sample data").first()).toBeVisible();
  await expect(m).not.toContainText("assistant.tool."); // no raw i18n key for the new chips
  await expect(m).not.toContainText(/\bget_market_trend\b/); // the chip is copy, not the tool name
  // Every outside fact carries a source and a date in the answer text.
  await expect(m).toContainText(
    /(Google Trends|Pinterest|Census|Jungle Scout)[^.\n]{0,80}\d{4}-\d{2}-\d{2}/,
  );
  const asked = await firstAnswerWithVotes(page);
  const done = doneButtons(m);
  const no = notUsefulButtons(m);
  expect(await done.count(), asked).toBeGreaterThan(0);
  expect(await no.count()).toBe(await done.count());
  // Sample-data recommendations carry the rec.sample sentence in their own text, not only a badge.
  if ((await m.getByText("Sample data").count()) > 0) {
    await expect(m).toContainText("Sample data, not your real market");
  }
  // Each recommendation shows its confidence band.
  await expect(m).toContainText(/High confidence|Medium confidence: test it|Not enough data/);
  expect(issues).toEqual([]);
});

test("a vote is stored once, a second tap shows the stored state, and it survives a reload (AC27, AC33)", async ({
  page,
}) => {
  await loginAs(page);
  await page.goto("/assistant");
  await settled(page);
  const asked = await firstAnswerWithVotes(page);
  const m = main(page);
  const no = notUsefulButtons(m);
  const total = await no.count();
  const target = no.nth(total - 1); // the last recommendation: the others must stay unvoted
  const name = await target.getAttribute("aria-label");
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");

  const api: Session = await signIn(OWNER.email, OWNER.password);
  const list = await api.api.market.recommendations.list({ limit: 50 });
  const voted = list.items.filter((r) => r.vote === "not_useful");
  expect(voted.length, "exactly one recommendation carries the vote").toBe(1);
  const votedAt = voted[0]?.votedAt;
  if (total > 1) expect(list.items.filter((r) => r.vote === "done")).toEqual([]);

  // A second tap shows the stored state and doesn't record a second vote.
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  const again = await api.api.market.recommendations.list({ limit: 50 });
  expect(again.items.filter((r) => r.vote === "not_useful").map((r) => r.votedAt)).toEqual([
    votedAt,
  ]);

  // Reload, reopen the conversation from the sidebar: the vote card is bound by id, not by text.
  await page.reload();
  await settled(page);
  await page.locator("aside button").filter({ hasText: asked }).first().click();
  await settled(page);
  const after = main(page).getByRole("button", { name: name ?? /not useful$/i });
  await expect(after.first()).toHaveAttribute("aria-pressed", "true");
  const others = notUsefulButtons(main(page));
  for (let i = 0; i < (await others.count()) - 1; i++) {
    await expect(others.nth(i)).not.toHaveAttribute("aria-pressed", "true");
  }
});

test("in Spanish the starter, chips, badge and vote buttons are Spanish (AC15)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
  await loginAs(page);
  const issues = watchPage(page);
  await page.goto("/assistant");
  await settled(page);
  await askStarter(page, "¿Cuáles de mis diseños están en tendencia?");
  const m = main(page);
  await expect(m.getByText("Tendencia del mercado").first()).toBeVisible();
  await expect(m.getByText("Datos de muestra").first()).toBeVisible();
  await expect(m).not.toContainText("Sample data");
  await expect(m).not.toContainText("Market trend");
  await expect(page.getByRole("button", { name: "¿Mi precio en Amazon está bien?" })).toHaveCount(
    1,
  );
  const es = m.getByRole("button", { name: /(hecho|no me sirve)$/i });
  const en = m.getByRole("button", { name: /(done|not useful)$/i });
  expect(await en.count()).toBe(0);
  if ((await es.count()) > 0) expect((await es.count()) % 2).toBe(0);
  expect(issues).toEqual([]);
});

test("the design page shows the niche chip with 0, 1 and 2 niches; one picker edits both and refuses a third (AC32)", async ({
  page,
}) => {
  await loginAs(page);
  const issues = watchPage(page);
  await page.goto("/catalog/designs");
  await settled(page);
  const link = page.locator('main a[href^="/catalog/designs/"]:not([href$="/new"])').first();
  await link.click();
  await page.waitForURL(/\/catalog\/designs\/[0-9a-f-]{36}$/);
  await settled(page);
  const designId = page.url().split("/").pop() ?? "";
  const api = await signIn(OWNER.email, OWNER.password);
  const original = await api.api.market.niches.get({ designId });
  const m = main(page);
  const chip = m.getByText(/^(Niche: |Niches: |No niche yet\.)/).first();
  await expect(chip).toBeVisible();
  if (original.niches.length === 0)
    await expect(chip).toContainText("No niche yet. Pick one to get market signals.");
  if (original.niches.length === 1) await expect(chip).toContainText(/^Niche: /);
  if (original.niches.length === 2) await expect(chip).toContainText(/^Niches: .+, .+/);

  const change = m.getByRole("button", { name: /^(Change|Pick a niche)$/ });
  await change.click();
  const dialog = page.getByRole("dialog");
  const search = dialog.getByRole("combobox");
  // Pick two, then try a third: the picker refuses it (the save still holds exactly two).
  const pick = async (typed: string, label: string) => {
    await search.fill(typed);
    await dialog.getByRole("option", { name: label }).click();
  };
  await pick("Teach", "Teachers");
  await pick("Retire", "Retirement");
  await search.fill("Hallow");
  const third = dialog.getByRole("option", { name: "Halloween" });
  if ((await third.count()) > 0 && (await third.isEnabled())) await third.click();
  await dialog.getByRole("button", { name: /^(Save|Guardar)$/ }).click();
  await expect(dialog).toBeHidden();
  await expect(m.getByText("Niches: Teachers, Retirement")).toBeVisible();
  expect((await api.api.market.niches.get({ designId })).niches).toEqual(["teacher", "retirement"]);

  // Clear both: the design is unclassified again.
  await m.getByRole("button", { name: "Change" }).click();
  await pick("Teach", "Teachers"); // toggles off
  await pick("Retire", "Retirement");
  await dialog.getByRole("button", { name: /^(Save|Guardar)$/ }).click();
  await expect(dialog).toBeHidden();
  await expect(m.getByText("No niche yet. Pick one to get market signals.")).toBeVisible();
  expect((await api.api.market.niches.get({ designId })).niches).toEqual([]);

  // Put the seed design back the way it was.
  await api.api.market.niches.set({ designId, niches: original.niches });
  expect(issues).toEqual([]);
});

test("a designer can change a niche but sees no votes or prices (AC24, T-18-5 AC6)", async ({
  page,
}) => {
  await loginAs(page, DESIGNER);
  const issues = watchPage(page);
  await page.goto("/catalog/designs");
  await settled(page);
  await page.locator('main a[href^="/catalog/designs/"]:not([href$="/new"])').first().click();
  await page.waitForURL(/\/catalog\/designs\/[0-9a-f-]{36}$/);
  await settled(page);
  const m = main(page);
  await expect(m.getByText(/^(Niche: |Niches: |No niche yet\.)/).first()).toBeVisible();
  await expect(m.getByRole("button", { name: /^(Change|Pick a niche)$/ })).toBeVisible();
  expect(await doneButtons(m).count()).toBe(0);
  await expect(m).not.toContainText(/Price position|Sample data/);
  expect(issues).toEqual([]);
});

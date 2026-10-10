import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  describeFound,
  dumpIfAsked,
  type Found,
  fixedEntries,
  type Lang,
  loadBaseline,
  scan,
  unbaselined,
} from "./a11y-core";
import { OWNER, signIn } from "./helpers/api";
import { loginAs, loginAsVendor, settled } from "./helpers/ui";

/**
 * Axe (wcag2a, wcag2aa, wcag21aa) on the main web screens in English and Spanish; fails on any
 * serious or critical violation that is not in a11y-baseline.json (see a11y-core.ts). The app has
 * no /es route: the language is the `invai.lang` localStorage key, set before the page loads.
 * The spec signs in and picks its own order and sheet through the API; it relies on no other spec.
 */
const LANGS: Lang[] = ["en", "es"];
const BASE = process.env.E2E_WEB_URL ?? "http://localhost:5173";
const VIEWPORT = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const found: Found[] = [];
const scanned = new Set<string>();

async function setLang(page: Page, lang: Lang) {
  await page.addInitScript((l) => localStorage.setItem("invai.lang", l), lang);
}

// Sign-in is rate limited per IP (decision 0008), so each role signs in once and the second
// language reuses that session; the order and sheet ids are looked up once too.
type State = Awaited<ReturnType<Page["context"]>["storageState"]>;
const sessions: Partial<Record<"owner" | "vendor", State>> = {};
let ids: { orderId: string; sheetId: string } | undefined;

async function signedInPage(
  browser: Browser,
  who: "owner" | "vendor",
  lang: Lang,
  opts: { viewport?: { width: number; height: number }; dark?: boolean } = {},
) {
  if (!sessions[who]) {
    const first = await browser.newContext({ baseURL: BASE, viewport: VIEWPORT });
    const p = await first.newPage();
    await (who === "owner" ? loginAs(p) : loginAsVendor(p));
    sessions[who] = await first.storageState();
    await first.close();
  }
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: opts.viewport ?? VIEWPORT,
    storageState: sessions[who],
  });
  const page = await context.newPage();
  await setLang(page, lang);
  // The app reads its theme from this localStorage key (src/lib/theme.ts).
  if (opts.dark) await page.addInitScript(() => localStorage.setItem("invai.theme", "dark"));
  return page;
}

async function seededIds() {
  if (ids) return ids;
  const api = (await signIn(OWNER.email, OWNER.password)).api;
  const order = (await api.orders.list({ limit: 1, sort: "shipBy", dir: "asc" })).items[0];
  const sheet = (await api.production.sheets.list({ limit: 1 })).items[0];
  expect(order, "the seed has an order").toBeTruthy();
  expect(sheet, "the seed has a gang sheet").toBeTruthy();
  ids = { orderId: order?.id as string, sheetId: sheet?.id as string };
  return ids;
}

async function visit(page: Page, route: string, url: string, lang: Lang, mode?: "dark") {
  await page.goto(url);
  await settled(page);
  // The page must be in the language under test, or the Spanish scan would prove nothing.
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  if (mode === "dark") {
    // A dark run must really be dark, or its scan would repeat the light one.
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  }
  found.push(...(await scan(page, route, lang)));
  scanned.add(`${route}|${lang}`);
}

test.describe.configure({ mode: "serial" });

for (const lang of LANGS) {
  test(`sign-in screen has no new serious accessibility violations (${lang})`, async ({ page }) => {
    await setLang(page, lang);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /^(Sign in|Iniciar sesión)$/ })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    found.push(...(await scan(page, "/login", lang)));
    scanned.add(`/login|${lang}`);
  });

  test(`owner screens have no new serious accessibility violations (${lang})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { orderId, sheetId } = await seededIds();
    const page = await signedInPage(browser, "owner", lang);
    const screens: [string, string][] = [
      ["/", "/"],
      ["/orders", "/orders"],
      ["/orders?order=<id>", `/orders?order=${orderId}`],
      ["/production/sheets", "/production/sheets"],
      ["/production/sheets/<id>", `/production/sheets/${sheetId}`],
      ["/analytics/profit", "/analytics/profit"],
      ["/settings/company", "/settings/company"],
    ];
    for (const [route, url] of screens) await visit(page, route, url, lang);
  });

  test(`owner Today, Orders and an order drawer at 390 px have no new serious accessibility violations (${lang})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { orderId } = await seededIds();
    const page = await signedInPage(browser, "owner", lang, { viewport: PHONE });
    expect(page.viewportSize()).toEqual(PHONE);
    const screens: [string, string][] = [
      ["/ [390]", "/"],
      ["/orders [390]", "/orders"],
      ["/orders?order=<id> [390]", `/orders?order=${orderId}`],
    ];
    for (const [route, url] of screens) await visit(page, route, url, lang);
  });

  test(`owner screens in dark mode have no new serious accessibility violations (${lang})`, async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { orderId, sheetId } = await seededIds();
    const page = await signedInPage(browser, "owner", lang, { dark: true });
    const screens: [string, string][] = [
      ["/ [dark]", "/"],
      ["/orders [dark]", "/orders"],
      ["/orders?order=<id> [dark]", `/orders?order=${orderId}`],
      ["/production/sheets [dark]", "/production/sheets"],
      ["/production/sheets/<id> [dark]", `/production/sheets/${sheetId}`],
      ["/analytics/profit [dark]", "/analytics/profit"],
      ["/settings/company [dark]", "/settings/company"],
    ];
    for (const [route, url] of screens) await visit(page, route, url, lang, "dark");
  });

  test(`vendor portal has no new serious accessibility violations (${lang})`, async ({
    browser,
  }) => {
    const page = await signedInPage(browser, "vendor", lang);
    await visit(page, "/vendor", "/vendor", lang);
  });
}

test("serious accessibility violations are all baselined, and the baseline holds no fixed entry", () => {
  dumpIfAsked(found);
  const baseline = loadBaseline();
  const fresh = unbaselined(found, baseline);
  const fixed = fixedEntries(found, baseline, scanned);
  expect(
    fresh,
    `New serious/critical violations (fix them, or ask for a baseline entry with a B-id):\n${describeFound(fresh)}`,
  ).toEqual([]);
  expect(
    fixed,
    `remove fixed baseline entry:\n${fixed.map((b) => `  - ${b.rule} ${b.route} ${b.target} (${b.backlog})`).join("\n")}`,
  ).toEqual([]);
});

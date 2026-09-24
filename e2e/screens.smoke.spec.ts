import { expect, test } from "@playwright/test";
import { OWNER, signIn } from "./helpers/api";
import { loginAs, loginAsVendor, type PageIssue, settled, watchPage } from "./helpers/ui";

/**
 * Every web screen once as the owner (and the vendor portal as the vendor): the page must
 * render, log no console errors and make no failed or 5xx requests.
 */
const SHOP_ROUTES = [
  "/",
  "/orders",
  "/orders?view=needs_mapping",
  "/orders?view=needs_artwork",
  "/orders?view=at_risk",
  "/production/sheets",
  "/production/stations",
  "/catalog/designs",
  "/catalog/blanks",
  "/catalog/products",
  "/catalog/sku-mapping",
  "/catalog/personalization",
  "/inventory/stock",
  "/inventory/purchase-orders",
  "/shipping",
  "/listings/drafts",
  "/listings/trademark",
  "/analytics/profit",
  "/assistant",
  "/settings/company",
  "/settings/team",
  "/settings/channels",
  "/settings/vendors",
  "/settings/stations",
  "/settings/costs",
  "/settings/billing",
  "/settings/audit",
];

// Noise that is not a product bug: Vite HMR / dev-only messages, favicon, React devtools hints.
const IGNORE = [/favicon/, /vite/i, /React DevTools/, /\[HMR\]/, /Download the React DevTools/];

test.describe.configure({ mode: "serial" });

test("every shop screen renders for the owner without errors", async ({ page }) => {
  test.setTimeout(300_000);
  const issues = watchPage(page, IGNORE);
  await loginAs(page);

  // Detail pages: pick real ids through the API so deep links are covered too.
  const api = (await signIn(OWNER.email, OWNER.password)).api;
  const order = (await api.orders.list({ limit: 1, sort: "shipBy", dir: "asc" })).items[0];
  const sheet = (await api.production.sheets.list({ limit: 1 })).items[0];
  const design = (await api.designs.list({ limit: 1 })).items[0];
  const template = (await api.personalization.templates.list({ limit: 1 })).items[0];
  const po = (await api.inventory.purchaseOrders.list({ limit: 1 })).items[0];
  const routes = [
    ...SHOP_ROUTES,
    `/orders?order=${order?.id}`,
    `/orders/${order?.id}`,
    `/production/sheets/${sheet?.id}`,
    `/catalog/designs/${design?.id}`,
    `/catalog/personalization/${template?.id}`,
    ...(po ? [`/inventory/purchase-orders/${po.id}`] : []),
  ];

  const perRoute: Record<string, PageIssue[]> = {};
  for (const route of routes) {
    const before = issues.length;
    const started = Date.now();
    await page.goto(route);
    await settled(page);
    console.log(`${route} ${Date.now() - started}ms`);
    // The app shell must not have fallen back to its error boundary.
    await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
    const mine = issues.slice(before);
    if (mine.length) perRoute[route] = mine;
  }
  const report = Object.entries(perRoute)
    .map(([r, list]) => `${r}\n${list.map((i) => `  - [${i.kind}] ${i.detail}`).join("\n")}`)
    .join("\n");
  console.log(report ? `Screen issues:\n${report}` : "No screen issues.");
  expect(perRoute, report).toEqual({});
});

test("the vendor portal renders for the vendor without errors", async ({ page }) => {
  const issues = watchPage(page, IGNORE);
  await loginAsVendor(page);
  for (const route of ["/vendor", "/vendor/shops"]) {
    await page.goto(route);
    await settled(page);
    await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
  }
  // A sheet in the inbox, when there is one.
  const first = page.locator("a[href^='/vendor/sheets/']").first();
  if (await first.count()) {
    await first.click();
    await settled(page);
  }
  const report = issues.map((i) => `[${i.kind}] ${i.url} ${i.detail}`).join("\n");
  expect(issues, report).toEqual([]);
});

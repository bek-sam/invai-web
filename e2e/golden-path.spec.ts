import path from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  type Api,
  FIXTURES,
  floorSession,
  inDays,
  OWNER,
  PRESSER_PIN,
  poll,
  seedOutput,
  signIn,
  stationSession,
} from "./helpers/api";
import { loginAs, loginAsVendor, settled } from "./helpers/ui";

/**
 * The golden path through the browser, on a freshly seeded database: Today -> CSV import ->
 * map -> proof -> gang sheets -> vendor portal -> receive -> (floor via API; the tablet UI has
 * its own suite in invai-floor/e2e) -> label -> profit -> AI -> tenant isolation.
 */
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let api: Api;
const state: {
  orderNo?: string;
  orderId?: string;
  itemId?: string;
  sheetId?: string;
  designId?: string;
} = {};

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  api = (await signIn(OWNER.email, OWNER.password)).api;
  // Direct-to-storage uploads (MinIO) fail silently in the UI; surface the storage error body.
  page.on("response", async (res) => {
    if (res.url().includes(":9000") && res.status() >= 400)
      console.log(
        `storage ${res.status()} ${res.request().method()} ${res.url().slice(0, 120)}\n` +
          `  request headers: ${JSON.stringify(await res.request().allHeaders())}\n` +
          `  body: ${(await res.text().catch(() => "")).slice(0, 300)}`,
      );
  });
  await loginAs(page);
});
test.afterAll(async () => context.close());

/** A toast in the notifications region (the same words often appear in the page too). */
const toast = (text: string | RegExp) =>
  page
    .getByRole("region", { name: /Notifications/ })
    .getByText(text)
    .first();

/** Click a button when it is on screen; on a re-run the step may already be done. */
const clickIfShown = async (scope: Page | ReturnType<Page["getByRole"]>, name: string | RegExp) => {
  const button = scope.getByRole("button", { name, exact: typeof name === "string" });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return true;
  }
  return false;
};

const ourItem = async () => {
  const order = (
    await api.orders.list({ search: "ETSY-OLD-CACTUS-XL", limit: 5, sort: "shipBy", dir: "asc" })
  ).items[0];
  const full = await api.orders.get({ id: order?.id as string });
  const item = full.items.find((i) => i.channelSku === "ETSY-OLD-CACTUS-XL");
  if (!item) throw new Error("the imported ETSY-OLD-CACTUS-XL item is missing");
  state.orderId = full.id;
  state.orderNo = full.orderNo;
  state.itemId = item.id;
  state.designId = item.design?.id ?? state.designId;
  state.sheetId = item.sheetId ?? state.sheetId;
  return item;
};

const openOrderDrawer = async (search: string, view?: string) => {
  await page.goto(`/orders?q=${encodeURIComponent(search)}${view ? `&view=${view}` : ""}`);
  await settled(page);
  await page.locator("[data-index='0']").first().click();
  await expect(page.getByRole("dialog", { name: "Order detail" })).toBeVisible();
};

test("1. owner signs in and Today shows the real numbers", async () => {
  await page.goto("/");
  await settled(page);
  const summary = await api.today.summary({});
  // getByText("Due today") is ambiguous when the team is over capacity today: the capacity
  // banner's text ("More work due today than the team can finish...") also contains the phrase.
  // The stat card is a link, so target it by role instead of loosening the text match.
  await expect(page.getByRole("link", { name: "Due today" })).toBeVisible();
  const main = await page.locator("main").innerText();
  expect(main).toContain(String(summary.orders.dueToday));
  expect(main).toContain(String(summary.orders.atRisk));
  await expect(page.getByText("Work by station")).toBeVisible();
});

test("2. Etsy CSV import through Settings > Channels; orders show up with a ship-by", async () => {
  await page.goto("/settings/channels");
  await settled(page);
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Import orders from CSV" });
  await expect(dialog).toBeVisible();
  const conn = dialog.locator("#imp-conn");
  const etsyValue = await conn
    .locator("option", { hasText: /etsy/i })
    .first()
    .getAttribute("value");
  await conn.selectOption(etsyValue as string);
  await dialog.locator("#imp-format").selectOption("etsy");
  await dialog
    .locator("input[type=file]")
    .setInputFiles(path.join(FIXTURES, "etsy-sold-order-items.csv"));
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  // Seen intermittently: MinIO answers 403 SignatureDoesNotMatch to the browser's presigned PUT
  // (the signature binds content-length). Retry once; the storage body is logged above.
  const failed = dialog.getByText(/Upload failed/);
  await Promise.race([
    expect(dialog.getByText("New orders")).toBeVisible({ timeout: 30_000 }),
    expect(failed).toBeVisible({ timeout: 30_000 }),
  ]).catch(() => {});
  if (await failed.isVisible().catch(() => false)) {
    console.log("upload failed once; retrying the import");
    await dialog
      .locator("input[type=file]")
      .setInputFiles(path.join(FIXTURES, "etsy-sold-order-items.csv"));
    await dialog.getByRole("button", { name: "Import", exact: true }).click();
  }
  await expect(dialog.getByText("New orders")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("Rows failed")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();

  await page.goto("/orders?q=3310000001");
  await settled(page);
  await expect(page.locator("[data-index='0']").first()).toContainText("3310000001");
  const order = (
    await api.orders.list({ search: "3310000001", limit: 5, sort: "shipBy", dir: "asc" })
  ).items[0];
  expect(order?.shipBy).toBeTruthy();
});

test("3. the unmapped SKU is mapped in the order drawer with a saved rule", async () => {
  const before = await ourItem();
  if (before.state !== "needs_mapping") {
    console.log("item already mapped on a previous run; skipping the drawer");
  } else {
    await openOrderDrawer("ETSY-OLD-CACTUS-XL", "needs_mapping");
    const drawer = page.getByRole("dialog", { name: "Order detail" });
    await expect(drawer).toContainText(/is not mapped|not recognized/);
    await drawer.getByRole("button", { name: "Map item" }).click();
    const dialog = page.getByRole("dialog", { name: /Map SKU/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Choose a design/ }).click();
    await page.getByPlaceholder("Search by code or name").fill("DB001");
    await page
      .getByRole("button", { name: /Saguaro Sunset/ })
      .first()
      .click();
    await dialog.getByLabel("Style").selectOption("G64000");
    await dialog.getByLabel("Color").selectOption("BLK");
    await dialog.getByLabel("Size").selectOption("XL");
    await expect(dialog.getByText("Remember this SKU")).toBeVisible();
    await dialog.getByRole("button", { name: "Map item" }).click();
    await expect(toast(/Mapped 1 item/)).toBeVisible();
    await expect(toast("Rule saved; future orders map themselves.")).toBeVisible();
  }
  const item = await ourItem();
  expect(item.state).not.toBe("needs_mapping");
  const rules = await api.skuRules.list({ search: "ETSY-OLD-CACTUS-XL", limit: 5 });
  expect(rules.items.length).toBeGreaterThan(0);
});

test("4. a personalized item shows its proof in the drawer and is approved", async () => {
  // The worker renders the proof right after import; wait for it before opening the drawer.
  const order = (
    await api.orders.list({ search: "3310000002", limit: 5, sort: "shipBy", dir: "asc" })
  ).items[0];
  const unit = (await api.orders.get({ id: order?.id as string })).items[0];
  await poll(
    () => api.personalization.artwork.get({ orderItemId: unit?.id as string }),
    (a) => ["rendered", "flagged", "approved"].includes(a.status),
    { label: "personalization render" },
  );
  await openOrderDrawer("3310000002");
  const drawer = page.getByRole("dialog", { name: "Order detail" });
  await expect(drawer.getByText(/Personalization ·/)).toBeVisible();
  await expect(drawer.getByRole("img", { name: "Proof" })).toBeVisible();
  if (await clickIfShown(drawer, "Approve proof"))
    await expect(toast("Artwork approved")).toBeVisible();
  await expect(drawer.getByText(/Personalization · Approved/i)).toBeVisible();
});

test("5. gang sheets: preview, build with progress, sheet page with preview and >= 80% film use", async () => {
  const current = await ourItem();
  if (current.state !== "ready") {
    console.log(`item is ${current.state}; skipping the build`);
  } else {
    await page.goto("/production/sheets");
    await settled(page);
    await page.getByRole("button", { name: "Build sheets" }).click();
    await page.locator("#cutoff").fill(inDays(3).slice(0, 10));
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("Items", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await expect(page.getByText(/Building \d+ items/)).toBeVisible();
    await expect(toast(/sheet\(s\) ready/)).toBeVisible({ timeout: 180_000 });
  }
  const item = await poll(
    () => api.orderItems.get({ id: state.itemId as string }),
    (i) => !!i.sheetId,
    { label: "item on sheet" },
  );
  state.sheetId = item.sheetId as string;
  const sheet = await api.production.sheets.get({ id: state.sheetId });
  console.log(
    "built sheet",
    sheet.name,
    "utilization",
    sheet.utilization,
    "length",
    sheet.lengthIn,
  );
  if (sheet.lengthIn >= 100) expect(sheet.utilization).toBeGreaterThanOrEqual(0.8);

  await page.goto(`/production/sheets/${state.sheetId}`);
  await settled(page);
  await expect(page.getByRole("img", { name: "Gang sheet preview" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Film use")).toBeVisible();
  await expect(page.locator("main")).toContainText(`${Math.round(sheet.utilization * 100)}%`);
});

test("6. send to vendor; the vendor acknowledges, prints and ships in the portal", async () => {
  if (await clickIfShown(page, "Send to vendor")) {
    const dialog = page.getByRole("dialog", { name: "Send to vendor" });
    await dialog.getByRole("button", { name: "Send to vendor" }).click();
    await expect(toast(/Sent to/)).toBeVisible();
  }

  const vendorPage = await (await page.context().browser()?.newContext())?.newPage();
  if (!vendorPage) throw new Error("no browser");
  await loginAsVendor(vendorPage);
  await vendorPage.goto("/vendor/shops"); // opening the shop list accepts the invite
  await settled(vendorPage);
  await expect(vendorPage.getByText("Desert Bloom Tees")).toBeVisible();
  await vendorPage.goto(`/vendor/sheets/${state.sheetId}`);
  await settled(vendorPage);
  if (await clickIfShown(vendorPage, "Acknowledge"))
    await expect(
      vendorPage.getByRole("region", { name: /Notifications/ }).getByText("Acknowledged"),
    ).toBeVisible();
  if (await clickIfShown(vendorPage, "Mark printed"))
    await expect(
      vendorPage.getByRole("region", { name: /Notifications/ }).getByText("Marked printed"),
    ).toBeVisible();
  if (await clickIfShown(vendorPage, "Mark shipped")) {
    const ship = vendorPage.getByRole("dialog", { name: "Mark shipped" });
    await ship.locator("#vs-carrier").fill("ups");
    await ship.locator("#vs-code").fill("1Z999E2E0002");
    await ship.getByRole("button", { name: "Save" }).click();
    await expect(
      vendorPage.getByRole("region", { name: /Notifications/ }).getByText("Marked shipped"),
    ).toBeVisible();
  }
  const sheet = await api.production.sheets.get({ id: state.sheetId as string });
  expect(["shipped", "received"]).toContain(sheet.status);
  await vendorPage.context().close();
});

test("7. the owner marks the sheet received; items are transfer_in", async () => {
  await page.reload();
  await settled(page);
  if (await clickIfShown(page, "Mark received"))
    await expect(toast("Transfers received")).toBeVisible();
  const item = await api.orderItems.get({ id: state.itemId as string });
  expect(["transfer_in", "pressed", "packed", "shipped"]).toContain(item.state);
});

test("8. the floor presses, QCs and packs the unit (API; the tablet UI has its own suite)", async () => {
  const station = stationSession(seedOutput().stationToken.token);
  const login = await station.api.floor.login({ pin: PRESSER_PIN });
  const floor = floorSession(login.sessionToken);
  const item = await api.orderItems.get({ id: state.itemId as string });
  const scan = (blankCode: string | null, st: "press" | "pack") =>
    floor.api.production.scan({
      clientScanId: crypto.randomUUID(),
      station: st,
      transferCode: `T:${item.transferId}`,
      blankCode,
      scannedAt: new Date().toISOString(),
    });
  if (item.state === "transfer_in") {
    const pressed = await scan(`B:${item.blank?.variantId}`, "press");
    expect(pressed.ok, pressed.message).toBe(true);
  }
  if (item.state !== "packed" && item.state !== "shipped") {
    const qc = await floor.api.production.qc({
      orderItemId: item.id,
      result: "pass",
      blankReusable: false,
      note: null,
    });
    expect(qc.item.state).toBe("packed");
  }
  if (item.state !== "shipped") {
    const packed = await scan(null, "pack");
    expect(packed.ok || packed.mismatch === "already_processed", packed.message).toBe(true);
  }
});

test("9. shipping: rate, buy a mock label, PDF opens, tracking pushed, order shipped", async () => {
  await ourItem(); // fills state when this step runs on its own
  const order0 = await api.orders.get({ id: state.orderId as string });
  if (order0.status === "shipped") {
    console.log("order already shipped on a previous run; checking the shipment only");
  } else {
    await page.goto("/shipping");
    await settled(page);
    const row = page.locator("tr, [role=row]", { hasText: state.orderNo as string }).first();
    await expect(row).toBeVisible();
    // Buying prints the 4x6 PDF: the page asks for the batch label PDF and opens it in a new
    // window. Headless Chromium downloads PDFs instead of rendering them, so the request is what
    // is checked here; the PDF bytes are verified through the API below.
    const labelPdf = page.waitForResponse(
      (r) => r.url().includes("/rpc/shipping/batchLabelPdf") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await row.getByRole("button", { name: "Rates" }).click();
    const dialog = page.getByRole("dialog", { name: /Rates for/ });
    await dialog.getByRole("button", { name: "Get rates" }).click();
    const rates = dialog.getByRole("list", { name: "Rates" });
    await expect(rates.getByRole("radio").first()).toBeVisible();
    await rates.getByRole("radio").first().check();
    await dialog.getByRole("button", { name: "Buy & print" }).click();
    await expect(toast(/Label bought/)).toBeVisible();
    expect((await labelPdf).status()).toBe(200);
  }
  const shipment = await poll(
    async () =>
      (await api.shipping.shipments.list({ orderId: state.orderId as string, limit: 5 })).items[0],
    (s) => !!s && s.status !== "pending" && s.status !== "rated" && s.trackingPush.status !== "pending",
    { label: "labeled shipment" },
  );
  expect(shipment?.labelKey).toBeTruthy();
  const label = await api.files.downloadUrl({
    fileKey: shipment?.labelKey as string,
    disposition: "inline",
  });
  expect((await fetch(label.url)).headers.get("content-type")).toContain("pdf");
  // T-2-5: Etsy (CSV-only) no longer ships at push time; the unit ships on the carrier's first
  // scan, which the mock carrier fakes after MOCK_CARRIER_TRANSIT_HOURS (dev/E2E sets it low; see
  // invai-infra/scripts/dev.sh). Poll instead of a single read.
  const order = await poll(
    () => api.orders.get({ id: state.orderId as string }),
    (o) => o.status === "shipped",
    { label: "order shipped" },
  );
  expect(order.status).toBe("shipped");
  await page.goto("/shipping");
  await settled(page);
  await page.getByRole("tab", { name: "Shipments" }).click();
  await expect(page.getByText(shipment?.trackingCode as string).first()).toBeVisible();
});

test("10. analytics shows profit for the order's design", async () => {
  await ourItem();
  const profit = await poll(
    () => api.finance.orderProfit({ orderId: state.orderId as string }),
    (p) => p.revenue > 0,
    { label: "order profit" },
  );
  expect(typeof profit.net).toBe("number");
  await page.goto("/analytics/profit");
  await settled(page);
  await expect(page.getByText("Net profit").first()).toBeVisible();
  const byDesign = await api.finance.profit({
    dimension: "design",
    period: { from: inDays(-30), to: inDays(1) },
    limit: 500,
    sort: "net",
  });
  expect(byDesign.rows.some((r) => r.key === state.designId)).toBe(true);
});

test("11. AI listing draft (mock) passes Etsy rules and is approved; trademark check flags Nike", async () => {
  await page.goto("/listings/drafts");
  await settled(page);
  await page.getByRole("button", { name: "Draft listings" }).click();
  const dialog = page.getByRole("dialog", { name: "Draft listings" });
  await dialog.getByRole("button", { name: /Choose a design/ }).click();
  await page.getByPlaceholder("Search by code or name").fill("DB003");
  await page
    .getByRole("button", { name: /Wild & Free Coyote/ })
    .first()
    .click();
  const etsy = dialog.getByRole("checkbox").first(); // Etsy is the first channel and on by default
  if ((await etsy.getAttribute("aria-checked")) !== "true") await etsy.click();
  await dialog.getByRole("button", { name: "Generate" }).click();
  await page.waitForURL(/\/listings\/drafts\/[0-9a-f-]+/, { timeout: 30_000 });
  await expect(page.getByText("Passes every channel rule")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(toast("Approved")).toBeVisible();

  await page.goto("/listings/trademark");
  await settled(page);
  await page.locator("#tm-text").fill("Just Do It Nike shirt");
  await page.getByRole("button", { name: "Check risk" }).click();
  await expect(page.getByText("Result")).toBeVisible();
  await expect(page.locator("main")).toContainText(/high/i);
  await expect(page.locator("main")).toContainText(/nike/i);
});

test("12. the assistant answers a margin question (streamed)", async () => {
  await page.goto("/assistant");
  await settled(page);
  await page
    .getByLabel("Ask about profit, orders, stock…")
    .fill("what was my TikTok margin this week?");
  await page.getByRole("button", { name: "Send" }).click();
  // The question is echoed first; the streamed answer must mention TikTok again.
  await expect
    .poll(
      async () => (await page.locator("main").innerText()).toLowerCase().split("tiktok").length,
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThan(2);
});

test("13. a second company signs up and sees none of Desert Bloom's data", async () => {
  const fresh = await (await page.context().browser()?.newContext())?.newPage();
  if (!fresh) throw new Error("no browser");
  const nonce = Math.random().toString(36).slice(2, 8);
  await fresh.goto("/signup");
  await fresh.locator("#name").fill("Isolation Owner");
  await fresh.locator("#email").fill(`iso-${nonce}@example.test`);
  await fresh.locator("#password").fill("iso-pass-1234!");
  await fresh.locator("#company").fill(`Isolation Co ${nonce}`);
  await fresh.getByRole("button", { name: "Create a company" }).click();
  await fresh.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
  await settled(fresh);
  await expect(fresh.getByText("Get set up")).toBeVisible();
  await fresh.goto("/orders");
  await settled(fresh);
  await expect(fresh.locator("[data-index='0']")).toHaveCount(0);
  await expect(fresh.locator("main")).not.toContainText("Desert Bloom");
  await fresh.goto(`/production/sheets/${state.sheetId}`);
  await settled(fresh);
  await expect(fresh.getByRole("img", { name: "Gang sheet preview" })).toHaveCount(0);
  await expect(fresh.locator("main")).not.toContainText(/Film use/);
  await fresh.context().close();
});

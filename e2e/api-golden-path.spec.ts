import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  FIXTURES,
  floorSession,
  inDays,
  OWNER,
  PRESSER_PIN,
  poll,
  type Session,
  seedOutput,
  signIn,
  signUpCompany,
  stationSession,
  uploadFile,
  VENDOR,
} from "./helpers/api";

/**
 * The golden path through the API alone (no browser): import -> map -> proof -> sheets ->
 * vendor -> receive -> press/QC/pack -> label -> profit -> AI. The UI specs cover the same
 * path through the screens; this one pins the backend behaviour and runs in under a minute.
 */
test.describe.configure({ mode: "serial" });

let owner: Session;
const state: {
  etsyConnectionId?: string;
  unmappedItemId?: string;
  unmappedOrderId?: string;
  personalizedItemId?: string;
  personalizedOrderId?: string;
  ourOrderId?: string;
  ourItemId?: string;
  sheetId?: string;
  transferId?: string;
  blankVariantId?: string;
  designId?: string;
  shipmentId?: string;
} = {};

test.beforeAll(async () => {
  owner = await signIn(OWNER.email, OWNER.password);
});

test("1. owner signs in and Today shows real numbers", async () => {
  const me = await owner.api.me.get({});
  expect(me.org.type).toBe("shop");
  const today = await owner.api.today.summary({});
  expect(today.orders.dueToday + today.orders.overdue + today.orders.atRisk).toBeGreaterThan(0);
  expect(today.stations.length).toBeGreaterThan(0);
});

test("2. Etsy CSV import creates orders with a ship-by", async () => {
  const channels = await owner.api.channels.list({});
  const etsy = channels.items.find((c) => c.channel === "etsy");
  expect(etsy, "the seed has an Etsy CSV connection").toBeTruthy();
  state.etsyConnectionId = etsy?.id;
  const fileKey = await uploadFile(
    owner,
    "csv",
    path.join(FIXTURES, "etsy-sold-order-items.csv"),
    "text/csv",
  );
  const report = await owner.api.channels.importCsv({
    id: etsy?.id as string,
    fileKey,
    format: "etsy",
  });
  // A re-run on the same database reports the orders as skipped (idempotent import).
  expect(
    report.ordersImported + report.ordersUpdated + report.ordersSkipped,
  ).toBeGreaterThanOrEqual(4);
  expect(report.rowsFailed).toBeGreaterThanOrEqual(1); // the broken row

  const list = await owner.api.orders.list({
    search: "3310000001",
    limit: 10,
    sort: "shipBy",
    dir: "asc",
  });
  const order = list.items.find((o) => o.channelOrderId === "3310000001");
  expect(order).toBeTruthy();
  expect(new Date(order?.shipBy as string).getTime()).toBeGreaterThan(
    new Date(order?.placedAt as string).getTime(),
  );
  state.ourOrderId = order?.id;
});

test("3. an unmapped SKU is mapped with a saved rule and becomes ready", async () => {
  const list = await owner.api.orders.list({
    search: "ETSY-OLD-CACTUS-XL",
    limit: 10,
    sort: "shipBy",
    dir: "asc",
  });
  const order = list.items[0];
  expect(order?.status).toBe("needs_attention");
  const full = await owner.api.orders.get({ id: order?.id as string });
  const item = full.items.find((i) => i.channelSku === "ETSY-OLD-CACTUS-XL");
  expect(item?.state).toBe("needs_mapping");
  const needsMapping = await owner.api.orders.list({
    itemState: ["needs_mapping"],
    limit: 100,
    sort: "shipBy",
    dir: "asc",
  });
  expect(needsMapping.items.some((o) => o.id === order?.id)).toBe(true);

  const designs = await owner.api.designs.list({ search: "Saguaro Sunset", limit: 5 });
  const design = designs.items.find((d) => d.code === "DB001");
  const blanks = await owner.api.blanks.list({ styleCode: "G64000", colorCode: "BLK", limit: 20 });
  const blank = blanks.items.find((b) => b.sizeCode === "XL");
  expect(design && blank).toBeTruthy();
  state.designId = design?.id;
  const mapped = await owner.api.orderItems.map({
    id: item?.id as string,
    designId: design?.id as string,
    blankVariantId: blank?.id as string,
    applyToSameSku: true,
    saveRule: {
      name: null,
      patternType: "exact",
      pattern: "ETSY-OLD-CACTUS-XL",
      channel: "etsy",
      connectionId: null,
      target: {
        kind: "direct",
        designId: design?.id as string,
        blankVariantId: blank?.id as string,
      },
      priority: 50,
      active: true,
    },
  });
  expect(mapped.item.state).toBe("ready");
  expect(mapped.ruleId).toBeTruthy();
  state.unmappedItemId = mapped.item.id;
  state.unmappedOrderId = order?.id;
});

test("4. a personalized item gets a proof and is approved", async () => {
  const list = await owner.api.orders.list({
    search: "3310000002",
    limit: 10,
    sort: "shipBy",
    dir: "asc",
  });
  const order = list.items.find((o) => o.channelOrderId === "3310000002");
  const full = await owner.api.orders.get({ id: order?.id as string });
  const item = full.items[0];
  expect(item?.personalization.length).toBeGreaterThan(0);
  const art = await poll(
    () => owner.api.personalization.artwork.get({ orderItemId: item?.id as string }),
    (a) => ["rendered", "flagged", "approved"].includes(a.status),
    { label: "personalization render" },
  );
  expect(art.fileKey).toBeTruthy();
  const url = await owner.api.files.downloadUrl({
    fileKey: art.previewKey ?? (art.fileKey as string),
    disposition: "inline",
  });
  const png = await fetch(url.url);
  expect(png.ok).toBe(true);
  expect(png.headers.get("content-type")).toContain("image");
  const approved = await owner.api.personalization.artwork.approve({
    orderItemId: item?.id as string,
  });
  expect(approved.status).toBe("approved");
  const after = await owner.api.orderItems.get({ id: item?.id as string });
  expect(after.state).toBe("ready");
  state.personalizedItemId = item?.id;
  state.personalizedOrderId = order?.id;
});

test("5. gang sheets: preview, build, progress, preview image, utilization >= 80%", async () => {
  const opts = {
    dueBefore: inDays(3),
    rushFirst: true,
    includeReprints: true,
    vendorConnectionId: null,
    maxSheets: null,
  };
  const preview = await owner.api.production.batches.preview(opts);
  expect(preview.items.length).toBeGreaterThan(10);
  expect(preview.items.some((i) => i.orderItemId === state.unmappedItemId)).toBe(true);
  expect(preview.items.some((i) => i.orderItemId === state.personalizedItemId)).toBe(true);

  const ref = await owner.api.production.batches.build({ ...opts, name: "E2E build" });
  const job = await poll(
    () => owner.api.production.jobs.get({ id: ref.jobId }),
    (j) => j.status === "done" || j.status === "failed",
    { label: "build job", timeoutMs: 300_000 },
  );
  expect(job.status, job.error ?? "").toBe("done");
  expect(job.resultIds.length).toBeGreaterThan(0);

  const sheets = await Promise.all(
    job.resultIds.map((id) => owner.api.production.sheets.get({ id })),
  );
  for (const s of sheets) {
    expect(s.status).toBe("ready");
    expect(s.files.previewKey).toBeTruthy();
  }
  const utilizations = sheets.map((s) => s.utilization);
  console.log(
    "sheet utilization",
    utilizations,
    "lengths",
    sheets.map((s) => s.lengthIn),
  );
  // Every full sheet (a partial last sheet may be short) nests at >= 80 %.
  const full = sheets.filter((s) => s.lengthIn >= 100);
  expect(full.length).toBeGreaterThan(0);
  for (const s of full) expect(s.utilization).toBeGreaterThanOrEqual(0.8);

  const urls = await owner.api.production.sheets.downloadUrls({ id: sheets[0]?.id as string });
  expect(urls.preview).toBeTruthy();
  const img = await fetch(urls.preview as string);
  expect(img.ok).toBe(true);

  const item = await owner.api.orderItems.get({ id: state.unmappedItemId as string });
  expect(item.state).toBe("on_sheet");
  expect(item.sheetId && item.transferId).toBeTruthy();
  state.sheetId = item.sheetId as string;
  state.transferId = item.transferId as string;
  state.ourItemId = item.id;
  state.ourOrderId = item.orderId;
  state.blankVariantId = item.blank?.variantId;
});

test("6. send to vendor; the vendor acknowledges, prints and ships", async () => {
  const sent = await owner.api.production.sheets.sendToVendor({ id: state.sheetId as string });
  expect(sent.status).toBe("sent");

  const vendor = await signIn(VENDOR.email, VENDOR.password);
  const me = await vendor.api.me.get({});
  expect(me.org.type).toBe("vendor");
  const inbox = await vendor.api.vendorPortal.inbox({ limit: 100 });
  expect(inbox.items.some((s) => s.id === state.sheetId)).toBe(true);
  const detail = await vendor.api.vendorPortal.get({ id: state.sheetId as string });
  expect(detail.transferCount).toBeGreaterThan(0);
  const urls = await vendor.api.vendorPortal.downloadUrls({ id: state.sheetId as string });
  expect(urls.png).toBeTruthy();
  const ack = await vendor.api.vendorPortal.acknowledge({ id: state.sheetId as string });
  expect(ack.status).toBe("acknowledged");
  const printed = await vendor.api.vendorPortal.markPrinted({ id: state.sheetId as string });
  expect(printed.status).toBe("printed");
  const shipped = await vendor.api.vendorPortal.markShipped({
    id: state.sheetId as string,
    carrier: "ups",
    trackingCode: "1Z999E2E0001",
  });
  expect(shipped.status).toBe("shipped");

  // The vendor sees nothing of the shop beyond its sheets.
  await expect(
    vendor.api.orders.list({ limit: 5, sort: "shipBy", dir: "asc" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("7. the owner marks the sheet received; items are transfer_in", async () => {
  const received = await owner.api.production.sheets.markReceived({ id: state.sheetId as string });
  expect(received.status).toBe("received");
  const item = await owner.api.orderItems.get({ id: state.ourItemId as string });
  expect(item.state).toBe("transfer_in");
});

test("8. floor: PIN login, wrong size is BLOCKED, right blank presses, QC pass, pack", async () => {
  const seed = seedOutput();
  const station = stationSession(seed.stationToken.token);
  const staff = await station.api.floor.staff({});
  expect(staff.items.length).toBeGreaterThan(0);
  const login = await station.api.floor.login({ pin: PRESSER_PIN });
  expect(login.station.kind).toBe("press");
  const floor = floorSession(login.sessionToken);

  const queue = await floor.api.production.queue({ station: "press", limit: 200 });
  expect(queue.items.some((q) => q.orderItemId === state.ourItemId)).toBe(true);

  const wrong = await owner.api.blanks.list({ styleCode: "G64000", colorCode: "BLK", limit: 20 });
  const wrongBlank = wrong.items.find((b) => b.sizeCode === "S");
  const scan = (blankCode: string | null, station: "press" | "pack" = "press") =>
    floor.api.production.scan({
      clientScanId: crypto.randomUUID(),
      station,
      transferCode: `T:${state.transferId}`,
      blankCode,
      scannedAt: new Date().toISOString(),
    });
  const blocked = await scan(`B:${wrongBlank?.id}`);
  expect(blocked.ok).toBe(false);
  expect(blocked.mismatch).toBe("wrong_size");
  expect(blocked.itemState).toBe("transfer_in");

  const pressed = await scan(`B:${state.blankVariantId}`);
  expect(pressed.ok, pressed.message).toBe(true);
  expect(pressed.itemState).toBe("pressed");
  expect(pressed.nextAction).toBe("qc");

  const qc = await floor.api.production.qc({
    orderItemId: state.ourItemId as string,
    result: "pass",
    blankReusable: false,
    note: null,
  });
  expect(qc.item.state).toBe("packed");

  const packQueue = await floor.api.production.queue({ station: "pack", limit: 200 });
  expect(packQueue.items.some((q) => q.orderItemId === state.ourItemId)).toBe(true);
  const packed = await scan(null, "pack");
  expect(packed.ok, packed.message).toBe(true);
  expect(packed.nextAction).toBe("ship");
});

test("9. shipping: rates, buy (mock carrier), label PDF, tracking pushed, items shipped", async () => {
  const queue = await owner.api.shipping.queue({ limit: 200 });
  expect(queue.items.some((q) => q.orderId === state.ourOrderId)).toBe(true);
  const rates = await owner.api.shipping.rates({ orderId: state.ourOrderId as string });
  expect(rates.rates.length).toBeGreaterThan(0);
  const cheapest = rates.rates.find((r) => r.cheapest) ?? rates.rates[0];
  const shipment = await owner.api.shipping.buy({
    shipmentId: rates.shipmentId,
    rateId: cheapest?.rateId as string,
  });
  expect(shipment.status).toBe("labeled");
  expect(shipment.trackingCode).toBeTruthy();
  expect(shipment.labelKey).toBeTruthy();
  state.shipmentId = shipment.id;
  const label = await owner.api.files.downloadUrl({
    fileKey: shipment.labelKey as string,
    disposition: "inline",
  });
  const pdf = await fetch(label.url);
  expect(pdf.headers.get("content-type")).toContain("pdf");
  const batch = await owner.api.shipping.batchLabelPdf({
    shipmentIds: [shipment.id],
    order: "bin",
  });
  expect(batch.pages).toBe(1);

  // Etsy is a CSV connection: there is no API to push to, so the push resolves to not_required
  // (manual upload) instead of pushed. Either way the shipment leaves the pending state.
  const pushed = await poll(
    () => owner.api.shipping.shipments.get({ id: shipment.id }),
    (s) => s.trackingPush.status === "pushed" || s.trackingPush.status === "not_required",
    { label: "tracking push" },
  );
  expect(["pushed", "not_required"]).toContain(pushed.trackingPush.status);
  const item = await owner.api.orderItems.get({ id: state.ourItemId as string });
  expect(item.state).toBe("shipped");
  const order = await owner.api.orders.get({ id: state.ourOrderId as string });
  expect(order.status).toBe("shipped");
});

test("10. analytics: profit for the order and its design", async () => {
  const profit = await poll(
    () => owner.api.finance.orderProfit({ orderId: state.ourOrderId as string }),
    (p) => p.revenue > 0,
    { label: "order profit" },
  );
  expect(profit.revenue).toBeGreaterThan(0);
  expect(typeof profit.net).toBe("number");
  const byDesign = await owner.api.finance.profit({
    dimension: "design",
    period: { from: inDays(-30), to: inDays(1) },
    limit: 200,
    sort: "net",
  });
  expect(byDesign.rows.some((r) => r.key === state.designId)).toBe(true);
});

test("11. AI listing draft (mock) validates for Etsy and is approved; trademark check flags Nike", async () => {
  if (!state.designId) {
    const designs = await owner.api.designs.list({ search: "Saguaro Sunset", limit: 5 });
    state.designId = designs.items.find((d) => d.code === "DB001")?.id;
  }
  const created = await owner.api.ai.listings.create({
    designId: state.designId as string,
    channels: ["etsy"],
    batch: false,
  });
  expect(created.drafts).toHaveLength(1);
  const draft = await poll(
    () => owner.api.ai.listings.get({ id: created.drafts[0]?.id as string }),
    (d) => d.status !== "generating",
    { label: "listing draft" },
  );
  expect(draft.status).toBe("needs_review"); // generated, waiting for a human
  expect(draft.content.title.length).toBeGreaterThan(0);
  const validation = await owner.api.ai.validate({ channel: "etsy", content: draft.content });
  expect(validation.ok).toBe(true);
  const approved = await owner.api.ai.listings.approve({ id: draft.id, acknowledgeRisk: false });
  expect(approved.status).toBe("approved");

  const tm = await owner.api.ai.trademarkCheck({ text: "Just Do It Nike shirt" });
  expect(tm.riskLevel).toBe("high");
  expect(tm.matches.length).toBeGreaterThan(0);
});

test("12. the assistant answers a margin question, streamed", async () => {
  const events: { type: string }[] = [];
  let text = "";
  for await (const ev of await owner.api.ai.assistant.ask({
    message: "what was my TikTok margin this week?",
  })) {
    events.push(ev);
    if (ev.type === "text_delta") text += ev.text;
  }
  expect(events[0]?.type).toBe("start");
  expect(events.at(-1)?.type).toBe("done");
  expect(events.filter((e) => e.type === "text_delta").length).toBeGreaterThan(1);
  expect(text.toLowerCase()).toContain("tiktok");
});

test("13. tenant isolation: a new company sees none of Desert Bloom's data", async () => {
  if (!state.ourOrderId || !state.sheetId) {
    state.ourOrderId = (
      await owner.api.orders.list({ limit: 1, sort: "shipBy", dir: "asc" })
    ).items[0]?.id;
    state.sheetId = (await owner.api.production.sheets.list({ limit: 1 })).items[0]?.id;
  }
  const { session } = await signUpCompany("E2E Isolation Co");
  const me = await session.api.me.get({});
  expect(me.org.name).toBe("E2E Isolation Co");
  const orders = await session.api.orders.list({ limit: 50, sort: "shipBy", dir: "asc" });
  expect(orders.items).toHaveLength(0);
  const designs = await session.api.designs.list({ limit: 50 });
  expect(designs.items).toHaveLength(0);
  const today = await session.api.today.summary({});
  expect(today.orders.dueToday + today.orders.overdue + today.blocked.needsMapping).toBe(0);
  await expect(session.api.orders.get({ id: state.ourOrderId as string })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    session.api.production.sheets.get({ id: state.sheetId as string }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

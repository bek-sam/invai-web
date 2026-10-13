import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { OWNER, type Session, signIn, uploadFile } from "./helpers/api";
import { loginAs, watchPage } from "./helpers/ui";

/*
 * T-48-5 (B-274): "Made with AI?" on a design and the AI-notice line on listing drafts (spec
 * listing-ai-disclosure.md, ACs 13-14c). It makes its own design through the API with a unique code
 * and never edits a seed design (QA r1 finding 7); the Desert Bloom owner is used because that shop
 * has the AI credits a draft needs. Drafts are polled with expect.poll, no sleeps. Serial, one worker.
 */

const AI_SENTENCE = /created with the use of AI/i;
const AI_SENTENCE_ES = /se creó con el uso de IA/i;
const RAW_KEY = /\b(designs|listings)\.aiUse\b/;

const OFFICE = { email: "office@desertbloom.test", password: "demo1234!" };
const state = { s: null as Session | null, designId: "" };

function tinyPng(): Buffer {
  const size = 64;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) rows.set([200, 30, 30, 255], y * (size * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function newDraft(): Promise<string> {
  const s = state.s as Session;
  const created = await s.api.ai.listings.create({
    designId: state.designId,
    channels: ["etsy"],
    batch: false,
  });
  const id = created.drafts[0]?.id as string;
  await expect
    .poll(async () => (await s.api.ai.listings.get({ id })).status, {
      timeout: 90_000,
      intervals: [500, 1000, 2000],
    })
    .toBe("needs_review");
  return id;
}

function updateInput(req: { postData(): string | null }): Record<string, unknown> {
  const body = JSON.parse(req.postData() ?? "{}");
  return (body.json ?? body) as Record<string, unknown>;
}

async function pick(page: Page, name: string) {
  await page.getByRole("radio", { name }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const s = await signIn(OWNER.email, OWNER.password);
  state.s = s;
  const dir = mkdtempSync(path.join(tmpdir(), "invai-w48-ai-use-"));
  const file = path.join(dir, "ai-use.png");
  writeFileSync(file, tinyPng());
  const fileKey = await uploadFile(s, "design", file, "image/png");
  const stamp = Date.now().toString(36);
  const created = await s.api.designs.create({
    code: `AIU-${stamp}`.toUpperCase().slice(0, 32),
    name: `AI use e2e ${stamp}`,
    tags: [],
    personalizationTemplateId: null,
    placements: [{ placement: "front", fileKey, widthIn: 1, heightIn: 1 }],
  });
  state.designId = created.id;
  expect(created.aiUse).toBe("unknown");
});

test("a new design reads 'Not set yet' and its draft keeps the notice, with a link to set it", async ({
  page,
}) => {
  const issues = watchPage(page);
  const draftId = await newDraft();
  const draft = await (state.s as Session).api.ai.listings.get({ id: draftId });
  expect(draft.designAiUse).toBe("unknown");
  expect(JSON.stringify(draft.content)).toMatch(AI_SENTENCE);

  await loginAs(page, OWNER);
  await page.goto(`/listings/drafts/${draftId}`);
  await expect(
    page.getByText("Includes the AI notice because nobody said how this design was made."),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Say how it was made" });
  await expect(link).toHaveAttribute("href", `/catalog/designs/${state.designId}`);
  await link.click();
  await expect(page.getByRole("radio", { name: "Not set yet" })).toBeChecked();
  expect(issues).toEqual([]);
});

test("choosing 'No' saves, survives a reload, and the next draft has no AI notice", async ({
  page,
}) => {
  const issues = watchPage(page);
  await loginAs(page, OWNER);
  await page.goto(`/catalog/designs/${state.designId}`);
  const isUpdate = (r: { url(): string; method(): string }) =>
    r.url().includes("/rpc/designs/update") && r.method() === "POST";
  const aiReq = page.waitForRequest(isUpdate);
  await pick(page, "No, made without AI");
  expect(Object.keys(updateInput(await aiReq)).sort()).toEqual(["aiUse", "id"]);
  await expect(page.getByText("Saved: No, made without AI")).toBeVisible();
  await expect(page.getByText("This is your statement. InvAI does not check it.")).toBeVisible();

  // The page Save sends the form fields and never aiUse.
  await page.locator("#name").fill(`AI use e2e renamed ${Date.now().toString(36)}`);
  const saveReq = page.waitForRequest(isUpdate);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = updateInput(await saveReq);
  expect(saved).toHaveProperty("name");
  expect(Object.keys(saved)).not.toContain("aiUse");
  await page.reload();
  await expect(page.getByRole("radio", { name: "No, made without AI" })).toBeChecked();

  const draftId = await newDraft();
  const draft = await (state.s as Session).api.ai.listings.get({ id: draftId });
  expect(draft.designAiUse).toBe("none");
  expect(JSON.stringify(draft.content)).not.toMatch(AI_SENTENCE);
  await page.goto(`/listings/drafts/${draftId}`);
  await expect(
    page.getByText("No AI notice. You marked this design as made without AI."),
  ).toBeVisible();
  await expect(page.getByText(AI_SENTENCE)).toHaveCount(0);
  expect(issues).toEqual([]);
});

test("choosing 'Yes' brings the notice back on a regenerated draft", async ({ page }) => {
  const issues = watchPage(page);
  await loginAs(page, OWNER);
  await page.goto(`/catalog/designs/${state.designId}`);
  await pick(page, "Yes, made with AI");
  await expect(page.getByText("Saved: Yes, made with AI")).toBeVisible();
  await expect(page.getByText("This is your statement.")).toHaveCount(0);

  const draftId = await newDraft();
  const draft = await (state.s as Session).api.ai.listings.get({ id: draftId });
  expect(draft.designAiUse).toBe("ai");
  expect(JSON.stringify(draft.content)).toMatch(AI_SENTENCE);
  await page.goto(`/listings/drafts/${draftId}`);
  await expect(
    page.getByText("Includes the AI notice: this design is marked made with AI."),
  ).toBeVisible();
  expect(issues).toEqual([]);
});

test("Spanish: control and draft line read in Spanish with no raw keys", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
  const issues = watchPage(page);
  const draftId = await newDraft();
  await loginAs(page, OWNER);
  await page.goto(`/catalog/designs/${state.designId}`);
  await expect(page.getByRole("group", { name: "¿Hecho con IA?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Sí, hecho con IA" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Sin definir" })).toBeVisible();
  await expect(page.getByText("Hasta que elijas No, tus listados dicen")).toBeVisible();
  await pick(page, "No, hecho sin IA");
  await expect(page.getByText("Guardado: No, hecho sin IA")).toBeVisible();
  await expect(page.getByText("Esta es tu declaración. InvAI no la verifica.")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(RAW_KEY);

  await page.goto(`/listings/drafts/${draftId}`);
  await expect(
    page.getByText("Sin aviso de IA. Marcaste este diseño como hecho sin IA."),
  ).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(RAW_KEY);
  expect(body).not.toMatch(AI_SENTENCE_ES);
  expect(issues).toEqual([]);
});

test("office staff (no catalog.manage) see the value as text, with the read-only line", async ({
  page,
}) => {
  const issues = watchPage(page);
  await loginAs(page, OFFICE);
  await page.goto(`/catalog/designs/${state.designId}`);
  await expect(page.getByText("Only people who manage the catalog can change this.")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByText("No, made without AI", { exact: true })).toBeVisible();
  expect(issues).toEqual([]);
});

test.afterAll(async () => {
  // The design stays (designs cannot be deleted); archive it so it does not clutter the catalog.
  if (state.s && state.designId) await state.s.api.designs.archive({ id: state.designId });
});

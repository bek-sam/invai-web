import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { expect, type Page, type Route, test } from "@playwright/test";
import { poll, type Session, signUpCompany, uploadFile } from "./helpers/api";
import { loginAs } from "./helpers/ui";

/*
 * T-43-4 (B-380 C4): print-file check results on the design page. Spec print-file-checks.md,
 * criteria 13, 14, 17, 25-30 (UI side). Preconditions are made through the API as a new company owner
 * (lesson W26): three generated PNGs at 320 DPI for a 2 x 2 in print, one per outcome.
 * DOM assertions only. Criteria 5, 7 and 8 stub the runQa / accept responses with page.route.
 */

/*
 * The checks run in a brand-new company, not in Desert Bloom: QA turns are limited per company
 * (T-43-3: 3 at once, then one every 20 s, shared with the order-artwork checks), and by the time
 * this spec runs the seeded shop's allowance is spent on its imported orders' artwork, so a design
 * check there waited minutes (gate runs 20261013T041217Z, T042203Z, T043728Z). A new company
 * owner can do everything the designer can on this page (catalog.manage).
 */
let DESIGNER = { email: "", password: "e2e-pass-1234!" };
const SIZE = 640; // px; 2 in => 320 DPI, above the 300 DPI target

type Px = [number, number, number, number];

/** A PNG made with Node built-ins only (no new dependency). */
function png(draw: (x: number, y: number) => Px): Buffer {
  const rows = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const o = y * (SIZE * 4 + 1);
    for (let x = 0; x < SIZE; x++) {
      const px = draw(x, y);
      rows.set(px, o + 1 + x * 4);
    }
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
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CLEAR: Px = [0, 0, 0, 0];
const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1;

// An opaque white frame on the file edge, a clear gap, then the art.
const whiteBox = png((x, y) =>
  x < 40 || y < 40 || x >= SIZE - 40 || y >= SIZE - 40
    ? [255, 255, 255, 255]
    : inBox(x, y, 80, 80, SIZE - 80, SIZE - 80)
      ? [200, 30, 30, 255]
      : CLEAR,
);
// Thick art plus a 3 px (0.009 in) black line: under the 0.02 in error limit.
const thinLine = png((x, y) =>
  inBox(x, y, 300, 400, 302 + 1, 560)
    ? [0, 0, 0, 255]
    : inBox(x, y, 100, 100, 540, 300)
      ? [30, 60, 200, 255]
      : CLEAR,
);
const clean = png((x, y) => (inBox(x, y, 120, 120, 520, 520) ? [20, 140, 60, 255] : CLEAR));

const designer = { s: null as Session | null };
const ids: Record<"warn" | "error" | "clean", string> = { warn: "", error: "", clean: "" };
let warnRegions = 0;

async function makeDesign(s: Session, label: string, bytes: Buffer, stamp: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "invai-w43-pc-"));
  const file = path.join(dir, `${label}.png`);
  writeFileSync(file, bytes);
  const fileKey = await uploadFile(s, "design", file, "image/png");
  const created = await s.api.designs.create({
    code: `PC-${label}-${stamp}`.slice(0, 32),
    name: `Print check ${label} ${stamp}`,
    tags: [],
    personalizationTemplateId: null,
    placements: [{ placement: "front", fileKey, widthIn: 2, heightIn: 2 }],
  });
  // QA runs in the background (one turn per company every 20 s once the burst is spent, T-43-3);
  // wait for it by polling designs.get (card note A18). If the background job has not answered
  // after 45 s, ask for the check by hand, like a designer pressing Run QA, and wait again.
  const waitQa = (ms: number) =>
    poll(
      () => s.api.designs.get({ id: created.id }),
      (d) => d.qaStatus !== "pending",
      { timeoutMs: ms, label: `QA of ${label}` },
    );
  const tried: string[] = [];
  let done = await waitQa(45_000).catch(() => null);
  for (let attempt = 0; !done && attempt < 6; attempt++) {
    try {
      done = await s.api.designs.runQa({ id: created.id, cleanAlpha: false });
    } catch (e) {
      tried.push(
        `${new Date().toISOString()} ${(e as { code?: string }).code ?? ""} ${String(e).slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  if (!done || done.qaStatus === "pending") {
    done = await waitQa(60_000).catch((e) => {
      throw new Error(`${e}; manual runQa tries: ${tried.join(" | ")}`);
    });
  }
  return done;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(600_000);
  const { session: s, email } = await signUpCompany(`E2E Print checks ${Date.now()}`);
  DESIGNER = { email, password: "e2e-pass-1234!" };
  designer.s = s;
  const stamp = Date.now().toString(36);
  const warn = await makeDesign(s, "warn", whiteBox, stamp);
  const error = await makeDesign(s, "error", thinLine, stamp);
  const ok = await makeDesign(s, "clean", clean, stamp);
  ids.warn = warn.id;
  ids.error = error.id;
  ids.clean = ok.id;
  const wb = warn.placements[0]?.qa.issues.find((i) => i.code === "white_box");
  expect(wb?.severity, "the frame file is a white_box warning").toBe("warn");
  warnRegions = wb?.regions?.length ?? 0;
  expect(warnRegions).toBeGreaterThan(0);
  expect(error.placements[0]?.qa.issues.find((i) => i.code === "thin_line")?.severity).toBe(
    "error",
  );
  expect(ok.placements[0]?.qa.issues).toHaveLength(0);
  // The three designs spent the burst; let two turns refill for the tests that press Run QA.
  await new Promise((r) => setTimeout(r, 45_000));
});

const open = async (page: Page, id: string) => {
  await page.goto(`/catalog/designs/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
};

const rpcError =
  (code: string, status: number, message: string, data?: unknown) => (route: Route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ json: { defined: true, code, status, message, data }, meta: [] }),
    });

test("a warning: places, overlay, accept, reload, both undos (13, 17, 30)", async ({ page }) => {
  await loginAs(page, DESIGNER);
  await open(page, ids.warn);
  const issue = page.getByTestId("qa-issue").filter({ hasText: "A white box surrounds the art" });
  await expect(issue).toBeVisible();
  await expect(issue.getByText(warnRegions === 1 ? "1 place" : `${warnRegions} places`)).toBeVisible();
  await expect(issue.getByText("Applies to this file only")).toBeVisible();
  await expect(page.getByTestId("qa-region")).toHaveCount(0);

  // 17: one box per region, hidden again on the second press.
  const toggle = issue.getByRole("button", { name: "Show on design" });
  await toggle.click();
  await expect(page.getByTestId("qa-region")).toHaveCount(warnRegions);
  await toggle.click();
  await expect(page.getByTestId("qa-region")).toHaveCount(0);

  // 13: accept; the badge stays a warning.
  await issue.getByRole("button", { name: "Accept this warning" }).click();
  await expect(issue.getByTestId("qa-accepted")).toContainText("Accepted by");
  await expect(page.getByText("QA: Warning")).toBeVisible();

  // The "Accepted by" line comes back from the server after a reload.
  await page.reload();
  const again = page.getByTestId("qa-issue").filter({ hasText: "A white box surrounds the art" });
  await expect(again.getByTestId("qa-accepted")).toContainText("Accepted by");
  await expect(page.getByText("QA: Warning")).toBeVisible();

  // 30: the Unaccept button.
  await again.getByRole("button", { name: "Undo accept" }).click();
  await expect(again.getByRole("button", { name: "Accept this warning" })).toBeVisible();
  await expect(page.getByText("QA: Warning")).toBeVisible();

  // 30: accept again; the toast Undo does the same.
  await again.getByRole("button", { name: "Accept this warning" }).click();
  await expect(again.getByTestId("qa-accepted")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(again.getByRole("button", { name: "Accept this warning" })).toBeVisible();
  await expect(again.getByTestId("qa-accepted")).toHaveCount(0);
});

test("an error has no Accept and says to upload a fixed file (14)", async ({ page }) => {
  await loginAs(page, DESIGNER);
  await open(page, ids.error);
  const issue = page.getByTestId("qa-issue").filter({ hasText: "too thin to print" });
  await expect(issue).toBeVisible();
  await expect(issue).toContainText("upload the file again");
  await expect(issue.getByRole("button", { name: "Accept this warning" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept this warning" })).toHaveCount(0);
});

test("a clean file says so and has no controls (26)", async ({ page }) => {
  await loginAs(page, DESIGNER);
  await open(page, ids.clean);
  await expect(page.getByText("No problems found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept this warning" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show on design" })).toHaveCount(0);
});

test("an issue without regions has no places or overlay control (29)", async ({ page }) => {
  await page.route("**/rpc/designs/get**", async (route) => {
    const res = await route.fetch();
    const strip = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(strip)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .filter(([k]) => k !== "regions")
                .map(([k, x]) => [k, strip(x)]),
            )
          : v;
    const body = (await res.json()) as { json: unknown; meta?: unknown };
    await route.fulfill({ response: res, json: { ...body, json: strip(body.json) } });
  });
  await loginAs(page, DESIGNER);
  await open(page, ids.warn);
  const issue = page.getByTestId("qa-issue").filter({ hasText: "A white box surrounds the art" });
  await expect(issue).toBeVisible();
  await expect(page.getByText(/\d+ places/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show on design" })).toHaveCount(0);
  await expect(page.getByTestId("qa-region")).toHaveCount(0);
});

test("while checking: checking text, no old list, no controls (25)", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/rpc/designs/runQa**", async (route) => {
    await gate;
    await route.continue();
  });
  await loginAs(page, DESIGNER);
  await open(page, ids.warn);
  await expect(page.getByRole("button", { name: "Accept this warning" })).toBeVisible();
  await page.getByRole("button", { name: "Run QA" }).click();
  await expect(page.getByText("Checking your art...")).toBeVisible();
  await expect(page.getByText("A white box surrounds the art")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept this warning" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show on design" })).toHaveCount(0);
  release();
  await expect(page.getByText("Checking your art...")).toHaveCount(0);
  await expect(page.getByText("A white box surrounds the art")).toBeVisible();
});

test("imaging down: calm message, old result kept, retry works (27, P4)", async ({ page }) => {
  await page.route(
    "**/rpc/designs/runQa**",
    rpcError("UPSTREAM_FAILED", 502, "An external service failed", {
      service: "imaging",
      detail: "connect ECONNREFUSED",
    }),
  );
  await loginAs(page, DESIGNER);
  await open(page, ids.warn);
  await page.getByRole("button", { name: "Run QA" }).click();
  await expect(
    page.getByText("We could not check this file. Try again in a minute."),
  ).toBeVisible();
  await expect(page.getByText("A white box surrounds the art")).toBeVisible();
  await expect(page.getByText("QA: Warning")).toBeVisible();
  await expect(page.getByText("UPSTREAM_FAILED")).toHaveCount(0);
  await expect(page.getByText("An external service failed")).toHaveCount(0);

  // Imaging comes back: Check again shows the real result.
  await page.unroute("**/rpc/designs/runQa**");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("We could not check this file")).toHaveCount(0);
  await expect(page.getByText("A white box surrounds the art")).toBeVisible();
});

test("too many checks: translated busy message (27)", async ({ page }) => {
  await page.route(
    "**/rpc/designs/runQa**",
    rpcError("RATE_LIMITED", 429, "Too many requests", {
      retryAfterSec: 30,
    }),
  );
  await loginAs(page, DESIGNER);
  await open(page, ids.warn);
  await page.getByRole("button", { name: "Run QA" }).click();
  await expect(page.getByText("Too many checks right now. Try again in a minute.")).toBeVisible();
  await expect(page.getByText("RATE_LIMITED")).toHaveCount(0);
});

test("accept fails: message in the shop's language, nothing shown accepted (28)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("invai.lang", "es"));
  await page.route(
    "**/rpc/designs/acceptQaWarning**",
    rpcError("QA_ISSUE_NOT_FOUND", 404, "No such issue on this placement"),
  );
  await loginAs(page, DESIGNER);
  await open(page, ids.warn);
  await page.getByRole("button", { name: "Aceptar esta advertencia" }).click();
  await expect(page.getByText("Ese problema ya no está en la lista")).toBeVisible();
  await expect(page.getByTestId("qa-accepted")).toHaveCount(0);
  await expect(page.getByText("QA_ISSUE_NOT_FOUND")).toHaveCount(0);
});

import { type DesignPlacement, QA_ISSUE_CODES, type QaIssue } from "@invai/contracts";
import { createInstance } from "i18next";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import {
  appLocale,
  classifyRunFailure,
  containRect,
  formatMeasuredIn,
  ISSUE_COPY,
  issueControls,
  issueListKey,
  issueText,
  mergeQa,
  qaActionErrorCode,
  qaPanelMode,
  regionToPercentBox,
  splitToast,
} from "./print-checks";
import { QaPanel, type QaPanelProps } from "./qa-panel";

const issue = (over: Partial<QaIssue> = {}): QaIssue => ({
  code: "white_box",
  severity: "warn",
  message: "English from imaging",
  ...over,
});
const qaOf = (issues: QaIssue[], status: DesignPlacement["qa"]["status"] = "warn") => ({
  status,
  effectiveDpi: 300,
  issues,
  checkedAt: null,
});

describe("issue copy", () => {
  it("has words for every contract code, in en and es", () => {
    for (const code of QA_ISSUE_CODES) {
      const copy = ISSUE_COPY[code];
      const keys = typeof copy === "string" ? [code] : [`${code}.error`, `${code}.warn`];
      for (const k of keys) {
        const path = `issue.${k}`.split(".");
        for (const cat of [en.qa, es.qa] as unknown[]) {
          let cur = cat as Record<string, unknown>;
          for (const part of path) cur = cur[part] as Record<string, unknown>;
          expect(typeof cur).toBe("string");
        }
      }
    }
  });
  it("picks by code and severity", () => {
    expect(
      issueText(issue({ code: "thin_line", severity: "error", measuredIn: 0.0123 }), "en-US"),
    ).toMatchObject({ key: "qa.issue.thin_line.error", params: { inches: "0.012" } });
    expect(issueText(issue({ code: "thin_line", measuredIn: 0.025 }), "es-MX")).toMatchObject({
      key: "qa.issue.thin_line.warn",
      params: { inches: "0.025" },
    });
    expect(issueText(issue({ code: "low_dpi", severity: "error" }), "en-US").key).toBe(
      "qa.issue.low_dpi.error",
    );
    expect(issueText(issue({ code: "white_box" }), "en-US")).toMatchObject({
      key: "qa.issue.white_box",
      params: {},
    });
  });
  it("falls back to the server message for an unknown code", () => {
    const t = issueText({ ...issue(), code: "future_code" as QaIssue["code"] }, "en-US");
    expect(t).toMatchObject({ key: null, fallback: "English from imaging" });
  });
  it("formats inches by locale, 3 decimals, never as 0", () => {
    expect(formatMeasuredIn(0.0125, "en-US")).toBe("0.013");
    expect(formatMeasuredIn(0.5, "es-MX")).toBe("0.5");
    expect(formatMeasuredIn(0.00042, "en-US")).toBe("0.00042");
    expect(formatMeasuredIn(0, "en-US")).toBe("0");
    expect(appLocale("es")).toBe("es-MX");
    expect(appLocale("en")).toBe("en-US");
  });
  it("keys the list by code and index", () => {
    expect(issueListKey(issue(), 2)).toBe("white_box-2");
  });
});

function rect(w: number, h: number) {
  const r = containRect(w, h);
  if (!r) throw new Error("no rect");
  return r;
}

describe("region boxes", () => {
  it("fills the square for a square picture", () => {
    const img = rect(100, 100);
    expect(regionToPercentBox({ left: 0.1, top: 0.2, width: 0.5, height: 0.25 }, img)).toEqual({
      left: 10,
      top: 20,
      width: 50,
      height: 25,
    });
  });
  it("maps onto the drawn picture for a wide image", () => {
    const img = rect(200, 100); // drawn 100% x 50%, starts at top 25%
    expect(img).toEqual({ left: 0, top: 0.25, width: 1, height: 0.5 });
    const b = regionToPercentBox({ left: 0, top: 0, width: 1, height: 1 }, img);
    expect(b).toEqual({ left: 0, top: 25, width: 100, height: 50 });
  });
  it("maps onto the drawn picture for a tall image", () => {
    const img = rect(100, 200);
    expect(img).toEqual({ left: 0.25, top: 0, width: 0.5, height: 1 });
    const b = regionToPercentBox({ left: 0.5, top: 0.5, width: 0.5, height: 0.5 }, img);
    expect(b).toEqual({ left: 50, top: 50, width: 25, height: 50 });
  });
  it("clamps a box that leaves the picture", () => {
    const img = rect(100, 100);
    const b = regionToPercentBox({ left: 0.9, top: -0.2, width: 0.5, height: 2 }, img);
    expect(b.left + b.width).toBeLessThanOrEqual(100);
    expect(b.top).toBe(0);
    expect(b.top + b.height).toBeLessThanOrEqual(100);
  });
  it("has no rectangle before the size is known", () => {
    expect(containRect(0, 0)).toBeNull();
  });
});

describe("panel state and controls", () => {
  it("picks the mode", () => {
    expect(qaPanelMode({ checking: true, qa: qaOf([issue()]) })).toBe("checking");
    expect(qaPanelMode({ checking: false, qa: qaOf([issue()]) })).toBe("list");
    expect(qaPanelMode({ checking: false, qa: qaOf([], "passed") })).toBe("none");
    expect(qaPanelMode({ checking: false, qa: qaOf([], "pending") })).toBe("pending");
  });
  it("shows Accept only on an open warning for someone who can manage", () => {
    const on = { canManage: true, checking: false };
    expect(issueControls(issue(), on)).toEqual({ accept: true, unaccept: false, accepted: false });
    expect(issueControls(issue({ severity: "error" }), on).accept).toBe(false);
    const done = issue({ acceptedAt: "2026-10-13T10:00:00.000Z", acceptedBy: "Ana" });
    expect(issueControls(done, on)).toEqual({ accept: false, unaccept: true, accepted: true });
    expect(issueControls(issue(), { canManage: false, checking: false }).accept).toBe(false);
    expect(issueControls(done, { canManage: false, checking: false }).unaccept).toBe(false);
    expect(issueControls(issue(), { canManage: true, checking: true }).accept).toBe(false);
  });
  it("sorts run failures and action errors", () => {
    expect(classifyRunFailure({ code: "UPSTREAM_FAILED", status: 502 })).toBe("unavailable");
    expect(classifyRunFailure({ code: "RATE_LIMITED", status: 429 })).toBe("busy");
    expect(classifyRunFailure({ code: "X", status: 503 })).toBe("busy");
    expect(classifyRunFailure({ code: "NOT_FOUND", status: 404 })).toBe("other");
    expect(classifyRunFailure(null)).toBeNull();
    expect(qaActionErrorCode({ code: "QA_NOT_WARNING" })).toBe("QA_NOT_WARNING");
    expect(qaActionErrorCode({ code: "QA_ISSUE_NOT_FOUND" })).toBe("QA_ISSUE_NOT_FOUND");
    expect(qaActionErrorCode({ code: "BOOM" })).toBeNull();
  });
  it("splits the toast text from its action word", () => {
    expect(splitToast("Warning accepted. Undo")).toEqual({
      message: "Warning accepted.",
      action: "Undo",
    });
    expect(splitToast("Advertencia aceptada. Deshacer")).toEqual({
      message: "Advertencia aceptada.",
      action: "Deshacer",
    });
    expect(splitToast("Done").action).toBe("Undo");
  });
  it("merges fresh QA only into drafts with the same file", () => {
    const fresh = qaOf([issue()]);
    const drafts = [
      { placement: "front", fileKey: "a", qa: null },
      { placement: "back", fileKey: "new", qa: null },
    ];
    const out = mergeQa(drafts, {
      placements: [
        { placement: "front", fileKey: "a", qa: fresh },
        { placement: "back", fileKey: "old", qa: fresh },
      ] as DesignPlacement[],
    });
    expect(out[0]?.qa).toBe(fresh);
    expect(out[1]?.qa).toBeNull();
  });
});

async function html(lng: "en" | "es", over: Partial<QaPanelProps>) {
  const i18n = createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  const props: QaPanelProps = {
    qa: qaOf([]),
    checking: false,
    failure: null,
    canManage: true,
    shown: new Set(),
    onToggleShown: () => {},
    onAccept: () => {},
    onUnaccept: () => {},
    onRetry: () => {},
    busyAction: null,
    actionError: null,
    ...over,
  };
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(QaPanel, props)),
  );
}

describe("QaPanel", () => {
  const regions = [0, 1, 2].map((i) => ({ left: i / 4, top: 0, width: 0.1, height: 0.1 }));
  const warn = issue({ regions });

  it("lists a warning with Accept, hint, places and the overlay toggle", async () => {
    const h = await html("en", { qa: qaOf([warn]) });
    expect(h).toContain("A white box surrounds the art");
    expect(h).toContain("Accept this warning");
    expect(h).toContain("Applies to this file only");
    expect(h).toContain("3 places");
    expect(h).toContain("Show on design");
  });
  it("shows no places or toggle without regions", async () => {
    const h = await html("en", { qa: qaOf([issue()]) });
    expect(h).not.toContain("places");
    expect(h).not.toContain("Show on design");
  });
  it("gives an error no Accept and the upload-a-fixed-file words", async () => {
    const h = await html("en", {
      qa: qaOf([issue({ code: "thin_line", severity: "error", measuredIn: 0.01 })], "failed"),
    });
    expect(h).not.toContain("Accept this warning");
    expect(h).toContain("upload the file again");
    expect(h).toContain("0.01 in");
  });
  it("shows who and when once accepted, with Undo accept, in Spanish too", async () => {
    const done = issue({ acceptedAt: "2026-10-13T10:00:00.000Z", acceptedBy: "Ana R." });
    const h = await html("es", { qa: qaOf([done]) });
    expect(h).toContain("Aceptada por Ana R. el");
    expect(h).toContain("Deshacer aceptación");
    expect(h).not.toContain("Aceptar esta advertencia");
  });
  it("hides every control from office users", async () => {
    const done = issue({ acceptedAt: "2026-10-13T10:00:00.000Z", acceptedBy: "Ana R." });
    const h = await html("en", {
      qa: qaOf([warn, { ...done, code: "non_srgb" }]),
      canManage: false,
    });
    expect(h).not.toContain("Accept this warning");
    expect(h).not.toContain("Undo accept");
    expect(h).toContain("Accepted by Ana R.");
  });
  it("shows only the checking line while a check runs", async () => {
    const h = await html("es", { qa: qaOf([warn]), checking: true });
    expect(h).toContain("Revisando tu arte...");
    expect(h).not.toContain("Aceptar esta advertencia");
    expect(h).not.toContain("Mostrar en el diseño");
    expect(h).not.toContain("caja blanca");
  });
  it("says there are no problems", async () => {
    const h = await html("en", { qa: qaOf([], "passed") });
    expect(h).toContain("No problems found.");
    expect(h).not.toContain("Accept");
  });
  it("keeps the old result and offers a retry when imaging is down or busy", async () => {
    const down = await html("en", { qa: qaOf([warn]), failure: "unavailable" });
    expect(down).toContain("We could not check this file");
    expect(down).toContain("Check again");
    expect(down).toContain("A white box surrounds the art");
    expect(down).toContain("Warning");
    const busy = await html("es", { qa: qaOf([warn]), failure: "busy" });
    expect(busy).toContain("Demasiadas revisiones ahora");
    expect(busy).not.toContain("UPSTREAM");
  });
  it("shows an accept failure in the shop's language", async () => {
    const h = await html("es", {
      qa: qaOf([warn]),
      actionError: { code: "QA_ISSUE_NOT_FOUND", issue: "white_box" },
    });
    expect(h).toContain("Ese problema ya no está en la lista");
    const e = await html("en", {
      qa: qaOf([warn]),
      actionError: { code: "QA_NOT_WARNING", issue: "white_box" },
    });
    expect(e).toContain("cannot be accepted");
  });
});

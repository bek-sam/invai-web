import i18n from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { batchSummary, countBatchMessage, countBatchResults } from "./shipping";

let tEn: typeof i18n.t;
let tEs: typeof i18n.t;
beforeAll(async () => {
  const inst = i18n.createInstance();
  await inst.init({
    lng: "en",
    resources: { en: { translation: en }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
  tEn = inst.getFixedT("en");
  tEs = inst.getFixedT("es");
});

const r = (...s: string[]) => s.map((status) => ({ status }));

describe("countBatchResults (sync path)", () => {
  it("counts each status separately; skipped never becomes failed", () => {
    expect(
      countBatchResults(r("labeled", "labeled", "skipped", "skipped", "skipped", "failed")),
    ).toEqual({
      labeled: 2,
      failed: 1,
      skipped: 3,
    });
    expect(countBatchResults(r("skipped", "skipped"))).toEqual({
      labeled: 0,
      failed: 0,
      skipped: 2,
    });
    expect(countBatchResults(r("labeled"))).toEqual({ labeled: 1, failed: 0, skipped: 0 });
    expect(countBatchResults([])).toEqual({ labeled: 0, failed: 0, skipped: 0 });
  });
});

describe("countBatchMessage (queued path)", () => {
  it("reads labeled, failed and skipped from the job message", () => {
    expect(countBatchMessage("3 labeled, 1 failed, 2 skipped; postage $9.80", 3)).toEqual({
      labeled: 3,
      failed: 1,
      skipped: 2,
    });
    expect(countBatchMessage("4 labeled, 0 failed; postage $12.00", 4)).toEqual({
      labeled: 4,
      failed: 0,
      skipped: 0,
    });
  });

  it("falls back to the returned labels only when the text is not the exact message", () => {
    const bad = [
      null,
      "",
      "done",
      "Note: 3 labeled, 1 failed; postage $9.80",
      "3 labeled, 1 failed; postage $9.80 extra",
      "3 labeled, 1 failed, 2 skipped, 1 other; postage $9.80",
    ];
    for (const m of bad) {
      expect(countBatchMessage(m, 3), String(m)).toEqual({ labeled: 3, failed: null, skipped: 0 });
    }
  });
});

describe("batchSummary", () => {
  it("shows skipped separately from failed, in English and Spanish", () => {
    const c = { labeled: 2, failed: 1, skipped: 3 };
    expect(batchSummary(c, "$9.80", tEn)).toEqual({
      title: "2 labels bought",
      description: "Postage $9.80 · 1 failed · 3 skipped",
      tone: "success",
    });
    expect(batchSummary(c, "$9.80", tEs).description).toBe(
      "Franqueo $9.80 · 1 con error · 3 omitido(s)",
    );
  });

  it("shows only skipped when nothing failed, and only failed when nothing was skipped", () => {
    expect(batchSummary({ labeled: 2, failed: 0, skipped: 3 }, null, tEn).description).toBe(
      "3 skipped",
    );
    expect(batchSummary({ labeled: 2, failed: 1, skipped: 0 }, null, tEn).description).toBe(
      "1 failed",
    );
    expect(batchSummary({ labeled: 2, failed: 0, skipped: 0 }, null, tEn).description).toBe("");
  });

  it("a batch of only skipped orders is information, not a success or error toast", () => {
    expect(batchSummary({ labeled: 0, failed: 0, skipped: 2 }, null, tEn).tone).toBe("info");
    expect(batchSummary({ labeled: 0, failed: 1, skipped: 2 }, null, tEn).tone).toBe("success");
    expect(batchSummary({ labeled: 1, failed: 0, skipped: 2 }, null, tEn).tone).toBe("success");
  });

  it("an unreadable queued message shows labels and postage only", () => {
    const c = countBatchMessage("garbled", 5);
    expect(batchSummary(c, "$20.00", tEn)).toEqual({
      title: "5 labels bought",
      description: "Postage $20.00",
      tone: "success",
    });
  });
});

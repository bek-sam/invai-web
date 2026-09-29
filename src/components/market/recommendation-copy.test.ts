import type { MarketRecommendation } from "@invai/contracts";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { recommendationActionText } from "./recommendation-copy";

/** A minimal stand-in for i18next's `t`: interpolates `{{key}}` into the given fallback text. */
function fakeT(_key: string, fallback: unknown, opts?: Record<string, unknown>): string {
  const template =
    typeof fallback === "string"
      ? fallback
      : typeof opts === "string"
        ? opts
        : (fallback as string);
  const values = typeof opts === "object" && opts ? opts : {};
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ""));
}
const t = fakeT as unknown as TFunction;

function rec(overrides: Partial<MarketRecommendation>): MarketRecommendation {
  return {
    id: "r1",
    rule: "R1",
    action: "list_and_stock",
    target: { designId: "d1", designName: "Cactus Mama", niche: null, channel: null },
    params: {},
    confidence: 0.6,
    band: "medium",
    mock: true,
    sources: [],
    evidenceSignalIds: [],
    stale: false,
    shownIn: "assistant",
    shownAt: "2026-09-27T00:00:00.000Z",
    vote: null,
    votedAt: null,
    adoptedAt: null,
    outcome: null,
    createdAt: "2026-09-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("recommendationActionText", () => {
  it("fills R1 with channels, blank and peak month, before the act-by date", () => {
    // A real "before {{peak}}" R1 always carries an act-by date (wave 20: `peakMonth` with no
    // `actByDate` means the peak is already under way -- see the test below).
    const r = rec({
      rule: "R1",
      params: {
        designName: "Cactus Mama",
        channels: ["amazon", "walmart"],
        blankName: "Gildan G64000 White M",
        peakMonth: 12,
        actByDate: "2026-11-01",
      },
    });
    const text = recommendationActionText(t, "en", r, (k) => k);
    expect(text).toContain("Cactus Mama");
    expect(text).toContain("Gildan G64000 White M");
    expect(text).toContain("December");
    expect(text).not.toContain("season is on now");
  });

  it("uses the peak-under-way wording for R1 when the act-by date is absent (wave 20)", () => {
    const r = rec({
      rule: "R1",
      params: { designName: "Blessed & Sun-Kissed", peakMonth: 9, niche: "faith" },
    });
    const text = recommendationActionText(t, "en", r, (key) => (key === "faith" ? "Faith" : key));
    expect(text).toBe(
      "The Faith season is on now. Make sure Blessed & Sun-Kissed is listed and in stock.",
    );
    expect(text).not.toContain("before");
  });

  it("falls back to the peak month name for R1 peak-under-way when there is no niche (round 2)", () => {
    // R1 can fire from the design's own sales seasonality with no niche mapping (reviewer r1
    // finding 1): the sentence must never render an empty slot ("The  season is on now...").
    const r = rec({
      rule: "R1",
      params: { designName: "Cactus Mama", peakMonth: 9 },
    });
    const en = recommendationActionText(t, "en", r, (k) => k);
    expect(en).toBe(
      "The September season is on now. Make sure Cactus Mama is listed and in stock.",
    );
    const es = recommendationActionText(t, "es", r, (k) => k);
    expect(es).toContain("septiembre");
    expect(es).not.toContain("The  season");
    expect(es).not.toMatch(/\bThe\s{2,}/);
  });

  it("falls back to a generic channel phrase when R1 has none listed", () => {
    const r = rec({
      rule: "R1",
      params: { designName: "X", blankName: "Blank", peakMonth: 1, actByDate: "2026-12-10" },
    });
    const text = recommendationActionText(t, "en", r, (k) => k);
    expect(text).toContain("your connected channels");
  });

  it("formats an R2 price range in the shop's language", () => {
    const r = rec({
      rule: "R2",
      params: { channel: "amazon", testPriceMinCents: 1999, testPriceMaxCents: 2099 },
    });
    const text = recommendationActionText(t, "en", r, (k) => k);
    expect(text).toContain("$19.99");
    expect(text).toContain("$20.99");
  });

  it("formats R3's floor price", () => {
    const r = rec({ rule: "R3", params: { designName: "Cactus Mama", floorPriceCents: 2499 } });
    const text = recommendationActionText(t, "en", r, (k) => k);
    expect(text).toContain("$24.99");
    expect(text).toContain("Cactus Mama");
  });

  it("looks up R4's niche label", () => {
    const r = rec({ rule: "R4", params: { niche: "dog-mom" } });
    const text = recommendationActionText(t, "en", r, (key) =>
      key === "dog-mom" ? "Dog moms" : key,
    );
    expect(text).toContain("Dog moms");
  });

  it("fills R5 with the design name", () => {
    const r = rec({ rule: "R5", params: { designName: "Pumpkin Spice Desert" } });
    const text = recommendationActionText(t, "en", r, (k) => k);
    expect(text).toContain("Pumpkin Spice Desert");
    expect(text).toContain("Pause ads");
  });
});

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
  it("fills R1 with channels, blank and peak month", () => {
    const r = rec({
      rule: "R1",
      params: {
        designName: "Cactus Mama",
        channels: ["amazon", "walmart"],
        blankName: "Gildan G64000 White M",
        peakMonth: 12,
      },
    });
    const text = recommendationActionText(t, "en", r, (k) => k);
    expect(text).toContain("Cactus Mama");
    expect(text).toContain("Gildan G64000 White M");
    expect(text).toContain("December");
  });

  it("falls back to a generic channel phrase when R1 has none listed", () => {
    const r = rec({ rule: "R1", params: { designName: "X", blankName: "Blank", peakMonth: 1 } });
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

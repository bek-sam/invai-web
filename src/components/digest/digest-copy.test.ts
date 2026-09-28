import type { DigestInsight } from "@invai/contracts";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { digestActionText, digestWinText, sourceDateText } from "./digest-copy";

/** A minimal stand-in for i18next's `t`: interpolates `{{key}}` into the given fallback text. */
function fakeT(_key: string, fallback: unknown, opts?: Record<string, unknown>): string {
  const template = typeof fallback === "string" ? fallback : "";
  const values = typeof opts === "object" && opts ? opts : {};
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ""));
}
const t = fakeT as unknown as TFunction;

function fact(id: string, en: string, es = en) {
  return { id, unit: "text" as const, value: en, formatted: { en, es } };
}

function insight(overrides: Partial<DigestInsight>): DigestInsight {
  return {
    id: "i1",
    detector: "D8",
    rank: 1,
    score: 1,
    confidence: 0.9,
    impactCents: null,
    action: { kind: "none", params: {}, href: "/analytics/profit?dim=day&days=7" },
    facts: [],
    templateKey: "D8 win",
    recommendation: null,
    myVote: null,
    clicked: false,
    ...overrides,
  };
}

describe("digestWinText", () => {
  it('matches the backend\'s real wire templateKey ("D8 win") and picks best-net-week from facts', () => {
    const i = insight({
      templateKey: "D8 win",
      facts: [fact("d8.net", "$1,240.00"), fact("d8.weeks", "8")],
    });
    const text = digestWinText(t, "en", i);
    expect(text).toBe("Your best net week in 8 weeks: $1,240.00");
  });

  it("picks the on-time-record headline when only the on-time fact is present", () => {
    const i = insight({
      templateKey: "D8 win",
      facts: [fact("d8.onTimeRate", "98%")],
    });
    const text = digestWinText(t, "en", i);
    expect(text).toBe("Your best on-time rate yet: 98%");
  });

  it("picks the fact's own Spanish-formatted value when the app language is Spanish", () => {
    const i = insight({
      templateKey: "D8 win",
      facts: [fact("d8.net", "$1,240.00", "1.240,00 USD"), fact("d8.weeks", "8", "8")],
    });
    const en = digestWinText(t, "en", i);
    const es = digestWinText(t, "es", i);
    expect(en).toContain("$1,240.00");
    expect(es).toContain("1.240,00 USD");
    expect(es).not.toContain("$1,240.00");
  });

  it("falls back to the generic celebration for a templateKey that isn't the real wire value", () => {
    const i = insight({ templateKey: "win.best_net_week", facts: [fact("d8.net", "$1.00")] });
    expect(digestWinText(t, "en", i)).toBe("Something worth celebrating this week.");
  });

  it("falls back to the generic celebration when D8 win has neither fact", () => {
    const i = insight({ templateKey: "D8 win", facts: [] });
    expect(digestWinText(t, "en", i)).toBe("Something worth celebrating this week.");
  });
});

describe("digestActionText review_costs (D3)", () => {
  it("translates the costLine enum to a plain word, never the raw identifier", () => {
    const i = insight({
      action: {
        kind: "review_costs",
        params: { costLine: "channelFees" },
        href: "/settings/costs",
      },
    });
    const text = digestActionText(t, "en", i, (k) => k);
    expect(text).toBe("Review channel fee costs");
    expect(text).not.toContain("channelFees");
  });

  it("translates every known cost line", () => {
    const cases: Array<[string, string]> = [
      ["blankCost", "blank"],
      ["transferCost", "transfer"],
      ["labelCost", "shipping label"],
      ["packagingCost", "packaging"],
      ["laborCost", "labor"],
      ["adsCost", "ad"],
      ["refunds", "refund"],
    ];
    for (const [costLine, word] of cases) {
      const i = insight({
        action: { kind: "review_costs", params: { costLine }, href: "/settings/costs" },
      });
      expect(digestActionText(t, "en", i, (k) => k)).toBe(`Review ${word} costs`);
    }
  });

  it("still shows a real word for a costLine value it doesn't recognize, never a blank", () => {
    const i = insight({
      action: {
        kind: "review_costs",
        params: { costLine: "somethingNew" },
        href: "/settings/costs",
      },
    });
    expect(digestActionText(t, "en", i, (k) => k)).toBe("Review somethingNew costs");
  });
});

describe("sourceDateText", () => {
  it("formats the date from the app language, not the runtime default locale", () => {
    const en = sourceDateText(t, "en", "google_trends", "2026-09-20T00:00:00.000Z");
    const es = sourceDateText(t, "es", "google_trends", "2026-09-20T00:00:00.000Z");
    expect(en).toContain("Sep");
    expect(es).not.toBe(en);
  });
});

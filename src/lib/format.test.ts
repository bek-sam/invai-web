import i18n from "i18next";
import { describe, expect, it } from "vitest";
import {
  endOfDayIso,
  firstName,
  formatDay,
  formatInches,
  formatMoneyShortLocale,
  formatPct,
  formatPctNumberLocale,
  formatPercentPoints,
  formatRatioPctLocale,
  freightProgress,
  parseDollarsToCents,
  parseTags,
  slugify,
  summarizeStates,
  toDateInput,
  validateListingLive,
} from "./format";

describe("format helpers", () => {
  it("formats inches and percentages", () => {
    expect(formatInches(22)).toBe("22″");
    expect(formatInches(38.46)).toBe("38.5″");
    expect(formatPct(0.873)).toBe("87%");
    expect(formatPct(null)).toBe("—");
  });

  it("keeps only the buyer's first name", () => {
    expect(firstName("Maria  Lopez Garcia")).toBe("Maria");
    expect(firstName("")).toBe("—");
    expect(firstName(null)).toBe("—");
  });

  it("follows the app's chosen language, not the runtime's default locale (B-207 AC1)", () => {
    const original = i18n.language;
    try {
      i18n.language = "en";
      expect(formatDay("2026-09-21")).toMatch(/^Mon, Sep 21$/);
      i18n.language = "es";
      const es = formatDay("2026-09-21");
      expect(es).not.toMatch(/\b(Mon|Sep)\b/);
      expect(es.toLowerCase()).toContain("lun");
      expect(es.toLowerCase()).toContain("sep");
    } finally {
      i18n.language = original;
    }
  });

  it("round-trips local calendar days", () => {
    const d = new Date(2026, 8, 24, 15, 30);
    expect(toDateInput(d)).toBe("2026-09-24");
    const end = new Date(endOfDayIso("2026-09-24"));
    expect(end.getDate()).toBe(24);
    expect(end.getHours()).toBe(23);
  });

  it("parses dollars into integer cents", () => {
    expect(parseDollarsToCents("12.5")).toBe(1250);
    expect(parseDollarsToCents("$1,200.99")).toBe(120099);
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("")).toBeNull();
  });

  it("parses tags and slugs", () => {
    expect(parseTags("cactus, desert tee,\n ,retro")).toEqual(["cactus", "desert tee", "retro"]);
    expect(slugify("Desert Bloom Tees!")).toBe("desert-bloom-tees");
  });

  it("summarizes item states in pipeline order", () => {
    expect(summarizeStates(["packed", "ready", "ready", "on_hold"])).toEqual([
      { state: "on_hold", count: 1 },
      { state: "ready", count: 2 },
      { state: "packed", count: 1 },
    ]);
  });

  it("computes free-freight progress", () => {
    expect(freightProgress(15000, 20000)).toEqual({ ratio: 0.75, shortfall: 5000 });
    expect(freightProgress(25000, 20000)).toEqual({ ratio: 1, shortfall: 0 });
    expect(freightProgress(100, 0)).toEqual({ ratio: 1, shortfall: 0 });
  });

  it("formats a locale-aware percent for a ratio and for the analytics *Pct convention (T-A6, AC7)", () => {
    const original = i18n.language;
    try {
      i18n.language = "en";
      expect(formatRatioPctLocale(0.873)).toBe("87%");
      expect(formatRatioPctLocale(null)).toBe("—");
      expect(formatPctNumberLocale(31.6)).toBe("31.6%");
      expect(formatPctNumberLocale(null)).toBe("—");
      i18n.language = "es";
      expect(formatRatioPctLocale(0.873)).toContain("87");
      expect(formatPctNumberLocale(31.6)).toContain("31,6");
    } finally {
      i18n.language = original;
    }
  });

  it("signs percent-point changes and keeps the spec's '+6,9 pts' style in Spanish", () => {
    const original = i18n.language;
    try {
      i18n.language = "en";
      expect(formatPercentPoints(6.9)).toBe("+6.9 pts");
      expect(formatPercentPoints(-3.2)).toBe("-3.2 pts");
      expect(formatPercentPoints(0)).toBe("0.0 pts");
      expect(formatPercentPoints(null)).toBe("—");
      i18n.language = "es";
      expect(formatPercentPoints(6.9)).toBe("+6,9 pts");
    } finally {
      i18n.language = original;
    }
  });

  it("formats a locale-aware compact currency axis tick without a clipping non-breaking run (B-226)", () => {
    const original = i18n.language;
    try {
      i18n.language = "en";
      expect(formatMoneyShortLocale(12345)).toBe("$12.3K");
      i18n.language = "es";
      // Uses the narrow "$" symbol (not the longer "US$"), so a fixed-width axis never clips.
      expect(formatMoneyShortLocale(12345)).not.toContain("US$");
      expect(formatMoneyShortLocale(12345)).toContain("$");
    } finally {
      i18n.language = original;
    }
  });
});

describe("validateListingLive", () => {
  it("enforces Etsy's 140-character title and 13-tag limits", () => {
    const issues = validateListingLive("etsy", {
      title: "x".repeat(141),
      tags: Array.from({ length: 14 }, (_, i) => `tag${i}`),
    });
    expect(issues.some((i) => i.field === "title" && i.severity === "error")).toBe(true);
    expect(issues.some((i) => i.field === "tags" && /14 tags/.test(i.message))).toBe(true);
  });

  it("flags long Etsy tags with their index and duplicate tags", () => {
    const issues = validateListingLive("etsy", {
      title: "Desert bloom tee",
      tags: ["cactus", "a very long tag over twenty", "Cactus"],
    });
    expect(issues.find((i) => i.index === 1)?.severity).toBe("error");
    expect(issues.find((i) => i.index === 2)?.severity).toBe("warn");
  });

  it("accepts a clean Etsy draft", () => {
    expect(
      validateListingLive("etsy", { title: "Desert Bloom Cactus Tee", tags: ["cactus", "desert"] }),
    ).toEqual([]);
  });

  it("checks Amazon bullets", () => {
    const issues = validateListingLive("amazon", {
      title: "Tee",
      bullets: Array.from({ length: 6 }, () => "ok"),
    });
    expect(issues.some((i) => i.field === "bullets")).toBe(true);
  });
});

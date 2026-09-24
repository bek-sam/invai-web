import { describe, expect, it } from "vitest";
import {
  endOfDayIso,
  firstName,
  formatInches,
  formatPct,
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

import { describe, expect, it } from "vitest";
import { fitSlotText } from "./fit";

const slot = { wIn: 4, hIn: 1, fontSizePt: 48, maxChars: 12, uppercase: false };

describe("fitSlotText", () => {
  it("keeps short text at full size", () => {
    const r = fitSlotText(slot, "Ana");
    expect(r.scale).toBe(1);
    expect(r.overflow).toBe(false);
  });

  it("shrinks longer text but not below 60%", () => {
    const r = fitSlotText(slot, "Alexandra Maria");
    expect(r.scale).toBeLessThan(1);
    expect(r.scale).toBeGreaterThanOrEqual(0.6);
  });

  it("wraps across lines instead of overflowing when max lines is unbounded", () => {
    const r = fitSlotText(slot, "Maximiliano Fernández");
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.overflow).toBe(false);
    expect(r.tooLong).toBe(true); // still flagged by maxChars regardless of fit
  });

  it("flags overflow when maxLines forces a clip", () => {
    const r = fitSlotText({ ...slot, maxLines: 1 }, "Maximiliano Fernández");
    expect(r.overflow).toBe(true);
    expect(r.lines).toHaveLength(1);
  });

  it("respects minFontSizePt as a floor when it's larger than 60%", () => {
    const r = fitSlotText({ ...slot, minFontSizePt: 40 }, "Alexandra Maria");
    expect(r.fontSizePt).toBeGreaterThanOrEqual(40 - 1e-9);
  });

  it("uppercases when the slot asks for it", () => {
    expect(fitSlotText({ ...slot, uppercase: true }, "ana").lines.join(" ")).toBe("ANA");
  });
});

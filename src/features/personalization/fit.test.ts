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

  it("flags overflow and max length", () => {
    const r = fitSlotText(slot, "Maximiliano Fernández");
    expect(r.overflow).toBe(true);
    expect(r.tooLong).toBe(true);
  });

  it("uppercases when the slot asks for it", () => {
    expect(fitSlotText({ ...slot, uppercase: true }, "ana").text).toBe("ANA");
  });
});

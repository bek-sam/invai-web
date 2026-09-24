import { describe, expect, it } from "vitest";
import { nextActiveIndex, viewFilters } from "./views";

describe("order views", () => {
  it("maps saved tabs to list filters", () => {
    expect(viewFilters("all")).toEqual({});
    expect(viewFilters("at_risk")).toEqual({ atRisk: true });
    expect(viewFilters("on_hold")).toEqual({ status: ["on_hold"] });
  });

  it("moves the active row with j/k and clamps at the ends", () => {
    expect(nextActiveIndex("j", -1, 5)).toBe(0);
    expect(nextActiveIndex("j", 4, 5)).toBe(4);
    expect(nextActiveIndex("k", 0, 5)).toBe(0);
    expect(nextActiveIndex("k", 3, 5)).toBe(2);
    expect(nextActiveIndex("G", 0, 5)).toBe(4);
    expect(nextActiveIndex("x", 0, 5)).toBeNull();
    expect(nextActiveIndex("j", 0, 0)).toBeNull();
  });
});

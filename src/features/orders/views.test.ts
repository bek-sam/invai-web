import { describe, expect, it } from "vitest";
import { csvCell, ordersCsv } from "./export";
import {
  nextActiveIndex,
  OPEN_STATUSES,
  type OrderCounts,
  tabCount,
  todayRange,
  viewFilters,
} from "./views";

const counts = (byStatus: Partial<OrderCounts["byStatus"]>, extra: Partial<OrderCounts> = {}) =>
  ({
    byStatus: {
      new: 0,
      needs_attention: 0,
      in_production: 0,
      ready_to_ship: 0,
      partially_shipped: 0,
      shipped: 0,
      delivered: 0,
      on_hold: 0,
      cancelled: 0,
      ...byStatus,
    },
    byChannel: {},
    atRisk: 0,
    overdue: 0,
    dueToday: 0,
    ...extra,
  }) as OrderCounts;

describe("order views", () => {
  it("maps saved tabs to list filters", () => {
    expect(viewFilters("all")).toEqual({});
    expect(viewFilters("at_risk")).toEqual({ atRisk: true });
    expect(viewFilters("on_hold")).toEqual({ status: ["on_hold"] });
    expect(viewFilters("overdue")).toEqual({ overdue: true });
    expect(viewFilters("blocked")).toEqual({ itemState: ["needs_mapping", "needs_artwork"] });
    expect(viewFilters("cancelled")).toEqual({ status: ["cancelled"] });
    expect(viewFilters("shipped").status).toEqual(["partially_shipped", "shipped", "delivered"]);
    const due = viewFilters("due_today", {
      now: new Date("2026-09-25T18:00:00Z"),
      timeZone: "America/Phoenix",
    });
    expect(due).toEqual({
      status: OPEN_STATUSES,
      shipByFrom: "2026-09-25T07:00:00.000Z",
      shipByTo: "2026-09-26T07:00:00.000Z",
    });
  });

  it("computes today in the shop's zone, across DST, with a local fallback", () => {
    // 02:00 UTC on Sep 26 is still Sep 25 in Phoenix (UTC-7).
    expect(todayRange(new Date("2026-09-26T02:00:00Z"), "America/Phoenix")).toEqual({
      from: "2026-09-25T07:00:00.000Z",
      to: "2026-09-26T07:00:00.000Z",
    });
    // New York spring-forward day is 23 hours long.
    const ny = todayRange(new Date("2026-03-08T15:00:00Z"), "America/New_York");
    expect(ny).toEqual({ from: "2026-03-08T05:00:00.000Z", to: "2026-03-09T04:00:00.000Z" });
    const local = todayRange(new Date(2026, 8, 25, 13), undefined);
    expect(new Date(local.from).getHours()).toBe(0);
    expect(todayRange(new Date(), "Not/AZone").from).toBeTruthy();
  });

  it("counts each tab from the numbers that match its filter", () => {
    const base = counts(
      { new: 4, needs_attention: 5, in_production: 2, ready_to_ship: 1, on_hold: 3 },
      { atRisk: 6, overdue: 2, dueToday: 7 },
    );
    const byItemState = {
      needs_mapping: counts({ needs_attention: 2, on_hold: 1 }),
      needs_artwork: counts({ needs_attention: 3 }),
      blocked: counts({ needs_attention: 5, on_hold: 1 }),
    };
    expect(tabCount("needs_mapping", base, byItemState)).toBe(3);
    expect(tabCount("needs_artwork", base, byItemState)).toBe(3);
    expect(tabCount("blocked", base, byItemState)).toBe(6);
    expect(tabCount("ready", base)).toBe(4);
    expect(tabCount("in_production", base)).toBe(3);
    expect(tabCount("due_today", base)).toBe(7);
    expect(tabCount("overdue", base)).toBe(2);
    expect(tabCount("needs_mapping", base)).toBeUndefined();
    expect(tabCount("all", base)).toBeUndefined();
    expect(tabCount("ready", undefined)).toBeUndefined();
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

describe("orders CSV", () => {
  it("quotes cells and defuses spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it("writes one row per order with no address", () => {
    const csv = ordersCsv([
      {
        orderNo: "1548",
        channel: "etsy",
        status: "new",
        placedAt: "2026-09-24T10:00:00.000Z",
        shipBy: "2026-09-26T10:00:00.000Z",
        isRush: true,
        atRisk: false,
        isOverdue: false,
        buyerName: "Ana, B",
        itemCount: 2,
        totals: { subtotal: 5000, shipping: 0, tax: 0, discount: 0, total: 5450 },
        tags: ["gift", "vip"],
        hold: null,
        shipTo: { street1: "12 Secret St" },
      } as never,
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '1548,etsy,new,2026-09-24T10:00:00.000Z,2026-09-26T10:00:00.000Z,true,false,false,"Ana, B",2,54.50,gift; vip,',
    );
    expect(csv).not.toContain("Secret");
  });
});

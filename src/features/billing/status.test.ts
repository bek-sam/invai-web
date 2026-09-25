import { describe, expect, it } from "vitest";
import { billingBanner, choosablePlans, daysUntil, isCustomPlan, planMove } from "./status";

const now = new Date("2026-09-24T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("billingBanner", () => {
  it("always shows past due and an expired trial", () => {
    expect(billingBanner({ status: "past_due", trialEndsAt: null }, now)).toEqual({
      kind: "past_due",
    });
    expect(billingBanner({ status: "trial_expired", trialEndsAt: inDays(-3) }, now)).toEqual({
      kind: "trial_expired",
    });
  });

  it("shows a trial only in its last 7 days", () => {
    expect(billingBanner({ status: "trialing", trialEndsAt: inDays(12) }, now)).toBeNull();
    expect(billingBanner({ status: "trialing", trialEndsAt: inDays(7) }, now)).toEqual({
      kind: "trial_ending",
      daysLeft: 7,
    });
    expect(billingBanner({ status: "trialing", trialEndsAt: inDays(0.5) }, now)).toEqual({
      kind: "trial_ending",
      daysLeft: 1,
    });
    // Past the end but the nightly expiry hasn't run yet: "ends today", never negative.
    expect(billingBanner({ status: "trialing", trialEndsAt: inDays(-1) }, now)).toEqual({
      kind: "trial_ending",
      daysLeft: 0,
    });
    expect(billingBanner({ status: "trialing", trialEndsAt: null }, now)).toBeNull();
  });

  it("stays quiet for active and cancelled plans", () => {
    expect(billingBanner({ status: "active", trialEndsAt: inDays(2) }, now)).toBeNull();
    expect(billingBanner({ status: "cancelled", trialEndsAt: null }, now)).toBeNull();
  });
});

describe("plans", () => {
  const trial = { key: "trial" as const, priceMonthly: 0 };
  const starter = { key: "starter" as const, priceMonthly: 14900 };
  const growth = { key: "growth" as const, priceMonthly: 34900 };
  const scale = { key: "scale" as const, priceMonthly: 0 };

  it("treats a paid plan with no list price as custom", () => {
    expect(isCustomPlan(scale)).toBe(true);
    expect(isCustomPlan(trial)).toBe(false);
    expect(isCustomPlan(starter)).toBe(false);
  });

  it("orders moves by price", () => {
    expect(planMove(starter, growth)).toBe("upgrade");
    expect(planMove(growth, starter)).toBe("downgrade");
    expect(planMove(growth, growth)).toBe("current");
    expect(planMove(growth, scale)).toBe("custom");
    expect(planMove(scale, growth)).toBe("downgrade");
  });

  it("never offers the trial as a plan to pick", () => {
    expect(choosablePlans([trial, starter, scale]).map((p) => p.key)).toEqual(["starter", "scale"]);
  });

  it("counts whole days, rounding up", () => {
    expect(daysUntil(inDays(2.1), now)).toBe(3);
    expect(daysUntil(inDays(-5), now)).toBe(0);
  });
});

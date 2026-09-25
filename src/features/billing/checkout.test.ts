import { describe, expect, it } from "vitest";
import { billingActionError } from "./checkout";

const t = (_key: string, def: string) => def;

describe("billingActionError", () => {
  it("leaves plan and payment refusals to the upgrade dialog", () => {
    expect(billingActionError({ code: "PAYMENT_REQUIRED" }, "checkout", t)).toBeNull();
    expect(billingActionError({ code: "PLAN_LIMIT_REACHED" }, "checkout", t)).toBeNull();
  });

  it("says calmly when checkout isn't switched on yet (501)", () => {
    const err = {
      code: "NOT_IMPLEMENTED",
      status: 501,
      message: "Not implemented: billing.checkout",
    };
    expect(billingActionError(err, "checkout", t)?.title).toMatch(/isn't switched on yet/);
    expect(billingActionError(err, "portal", t)?.title).toMatch(/isn't switched on yet/);
  });

  it("never shows the server's own text", () => {
    const err = { code: "INTERNAL_SERVER_ERROR", status: 500, message: "stripe exploded" };
    const out = billingActionError(err, "checkout", t);
    expect(out?.title).toBe("Couldn't open checkout. Try again.");
    expect(JSON.stringify(out)).not.toContain("stripe");
  });
});

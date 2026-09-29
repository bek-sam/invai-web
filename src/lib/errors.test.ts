import { describe, expect, it } from "vitest";
import { errorInfo, isUnauthorized, shouldRetry, upgradeReason } from "./errors";

describe("errorInfo", () => {
  it("never passes the server's raw permission string through for FORBIDDEN (wave 20 gate issue 5)", () => {
    const err = Object.assign(new Error("Missing permission org.manage for digest.settings.get"), {
      code: "FORBIDDEN",
      status: 403,
    });
    expect(errorInfo(err)).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(errorInfo(err).message).toMatch(/don't have access to this page/);
    expect(errorInfo(err).message).not.toContain("Missing permission");
  });

  it("turns NOT_IMPLEMENTED into a friendly message", () => {
    const err = Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
      status: 501,
    });
    expect(errorInfo(err).message).toMatch(/isn't available yet/);
    expect(shouldRetry(0, err)).toBe(false);
  });

  it("recognizes network failures and auth errors", () => {
    expect(errorInfo(new TypeError("Failed to fetch")).code).toBe("NETWORK");
    expect(isUnauthorized({ code: "UNAUTHORIZED", status: 401, message: "Sign in" })).toBe(true);
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(0, { status: 404, code: "NOT_FOUND", message: "x" })).toBe(false);
  });
});

describe("upgradeReason", () => {
  it("reads a plan limit from the contract's `meter` field (or the plan's `limit` name)", () => {
    const err = {
      code: "PLAN_LIMIT_REACHED",
      status: 402,
      message: "Plan limit reached",
      data: { meter: "users", used: 5, limit: 5 },
    };
    expect(upgradeReason(err)).toEqual({ kind: "limit", meter: "users", used: 5, limit: 5 });
    expect(
      upgradeReason({ code: "PLAN_LIMIT_REACHED", data: { limit: "ai_credits" } }),
    ).toMatchObject({ kind: "limit", meter: "aiCredits", limit: null });
  });

  it("reads PAYMENT_REQUIRED and CREDITS_EXHAUSTED", () => {
    expect(
      upgradeReason({ code: "PAYMENT_REQUIRED", data: { checkoutUrl: "https://x.test/c" } }),
    ).toEqual({ kind: "payment", checkoutUrl: "https://x.test/c" });
    expect(upgradeReason({ code: "PAYMENT_REQUIRED" })).toEqual({
      kind: "payment",
      checkoutUrl: null,
    });
    expect(upgradeReason({ code: "CREDITS_EXHAUSTED", data: {} })).toMatchObject({
      meter: "aiCredits",
    });
  });

  it("ignores other errors", () => {
    expect(upgradeReason({ code: "FORBIDDEN" })).toBeNull();
    expect(upgradeReason(new Error("x"))).toBeNull();
    expect(upgradeReason(null)).toBeNull();
  });

  it("never passes the server's English text through for billing refusals", () => {
    const info = errorInfo({ code: "PAYMENT_REQUIRED", status: 402, message: "SERVER TEXT" });
    expect(info.code).toBe("PAYMENT_REQUIRED");
    expect(info.message).not.toContain("SERVER TEXT");
  });
});

describe("EMAIL_NOT_VERIFIED", () => {
  it("gets a plain message instead of the server text", () => {
    const err = Object.assign(new Error("Verify your email first"), {
      code: "EMAIL_NOT_VERIFIED",
      status: 403,
    });
    expect(errorInfo(err)).toMatchObject({ code: "EMAIL_NOT_VERIFIED", status: 403 });
    expect(errorInfo(err).message).toMatch(/Confirm your email/);
    expect(shouldRetry(0, err)).toBe(false);
  });
});

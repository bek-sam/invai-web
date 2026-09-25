import { describe, expect, it } from "vitest";
import { demoModeMessage, isDemoModeError } from "./demo-mode";

describe("DEMO_MODE", () => {
  it("recognizes the API's refusal and has a plain message", () => {
    expect(isDemoModeError({ code: "DEMO_MODE", status: 403 })).toBe(true);
    expect(isDemoModeError({ code: "PAYMENT_REQUIRED" })).toBe(false);
    expect(isDemoModeError(null)).toBe(false);
    expect(demoModeMessage()).toMatch(/sample shop/);
  });
});

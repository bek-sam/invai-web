import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { assistantErrorMessage } from "./assistant";

/** A minimal stand-in for i18next's `t`: returns the fallback default, ignoring the key. */
function fakeT(_key: string, fallback: unknown): string {
  return typeof fallback === "string" ? fallback : "";
}
const t = fakeT as unknown as TFunction;

describe("assistantErrorMessage", () => {
  it("maps spend_cap to a plain-language daily-limit message", () => {
    const msg = assistantErrorMessage(t, "spend_cap", "AI spend cap reached for company");
    expect(msg).toContain("Today");
    expect(msg).not.toBe("AI spend cap reached for company");
  });

  it("maps credits_exhausted to the same wording billing already uses for used-up credits", () => {
    const msg = assistantErrorMessage(t, "credits_exhausted", "CREDITS_EXHAUSTED");
    expect(msg).toContain("credits");
    expect(msg).not.toBe("CREDITS_EXHAUSTED");
  });

  it("maps refusal to a short plain couldn't-answer line", () => {
    const msg = assistantErrorMessage(t, "refusal", "model declined to answer");
    expect(msg).toBe("I couldn't answer that. Try again.");
  });

  it("maps internal to the same short couldn't-answer line as refusal", () => {
    const msg = assistantErrorMessage(t, "internal", "unexpected provider error");
    expect(msg).toBe("I couldn't answer that. Try again.");
  });

  it("keeps the server's own message for an unknown or missing code (e.g. rate_limited)", () => {
    expect(assistantErrorMessage(t, "rate_limited", "Too many requests, slow down")).toBe(
      "Too many requests, slow down",
    );
    expect(assistantErrorMessage(t, undefined, "Some other failure")).toBe("Some other failure");
  });
});

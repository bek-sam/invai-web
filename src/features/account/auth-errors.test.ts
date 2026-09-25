import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { authErrorMessage, isChallengeOver } from "./auth-errors";

// Returns the key so the test checks which message was picked, not its wording.
const t = ((key: string) => key) as unknown as TFunction;

describe("authErrorMessage", () => {
  it("maps Better Auth codes to translated messages", () => {
    expect(authErrorMessage({ code: "INVALID_TOKEN", status: 400 }, t)).toBe(
      "authError.linkExpired",
    );
    expect(authErrorMessage({ code: "TOKEN_EXPIRED" }, t)).toBe("authError.linkExpired");
    expect(authErrorMessage({ code: "INVALID_PASSWORD" }, t)).toBe("authError.wrongPassword");
    expect(authErrorMessage({ code: "INVALID_CODE", status: 401 }, t)).toBe("authError.wrongCode");
    expect(authErrorMessage({ code: "EMAIL_NOT_VERIFIED", status: 403 }, t)).toBe(
      "verifyEmail.needed",
    );
    expect(authErrorMessage({ code: "SESSION_NOT_FRESH" }, t)).toBe("authError.signInAgain");
  });

  it("puts rate limits first, whatever the code", () => {
    expect(authErrorMessage({ code: "INVALID_CODE", status: 429 }, t)).toBe("authError.tooMany");
  });

  it("never shows raw server text for unknown codes", () => {
    expect(authErrorMessage({ code: "SOMETHING_NEW", message: "Internal detail" }, t)).toBe(
      "authError.generic",
    );
    expect(authErrorMessage({ code: "SOMETHING_NEW" }, t, "Fallback")).toBe("Fallback");
    expect(authErrorMessage(new TypeError("Failed to fetch"), t)).toBe("authError.network");
  });
});

describe("isChallengeOver", () => {
  it("is true only when the code step has to restart", () => {
    expect(isChallengeOver("TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE")).toBe(true);
    expect(isChallengeOver("INVALID_TWO_FACTOR_COOKIE")).toBe(true);
    expect(isChallengeOver("INVALID_CODE")).toBe(false);
  });
});

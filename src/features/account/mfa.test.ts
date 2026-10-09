import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { shouldRetry } from "../../lib/errors";
import { authErrorMessage, isAccountLocked } from "./auth-errors";
import {
  canTurnOffMfa,
  isMfaRequired,
  lockedMinutes,
  mfaReturnTarget,
  mfaState,
  showMfaBanner,
} from "./mfa";

// Returns the key (and any minutes) so the test checks which message was picked, not its wording.
const t = ((key: string, _def?: string, opts?: { minutes?: number }) =>
  opts?.minutes ? `${key}:${opts.minutes}` : key) as unknown as TFunction;

const NOW = Date.parse("2026-10-10T12:00:00Z");
const future = "2026-10-15T00:00:00Z";
const past = "2026-10-01T00:00:00Z";

describe("account lockout message", () => {
  it("rounds retryAfterSec up to whole minutes", () => {
    expect(lockedMinutes({ code: "ACCOUNT_LOCKED", message: "x", retryAfterSec: 1800 })).toBe(30);
    expect(lockedMinutes({ code: "ACCOUNT_LOCKED", message: "x", retryAfterSec: 1741 })).toBe(30);
    expect(lockedMinutes({ code: "ACCOUNT_LOCKED", message: "x", retryAfterSec: 61 })).toBe(2);
    expect(lockedMinutes({ retryAfterSec: 5 })).toBe(1);
  });

  it("falls back to the Retry-After header, then to null", () => {
    expect(lockedMinutes({ code: "ACCOUNT_LOCKED" }, "120")).toBe(2);
    expect(lockedMinutes({ code: "ACCOUNT_LOCKED" }, "soon")).toBeNull();
    expect(lockedMinutes({ code: "ACCOUNT_LOCKED" })).toBeNull();
  });

  it("maps ACCOUNT_LOCKED before the generic 429 rule, never showing the raw code", () => {
    const err = { code: "ACCOUNT_LOCKED", status: 423, message: "locked", retryAfterSec: 1800 };
    expect(authErrorMessage(err, t)).toBe("authError.accountLocked:30");
    expect(authErrorMessage({ ...err, retryAfterSec: 60 }, t)).toBe("authError.accountLockedOne");
    expect(authErrorMessage({ code: "ACCOUNT_LOCKED", status: 429 }, t, undefined, "300")).toBe(
      "authError.accountLocked:5",
    );
    expect(isAccountLocked("ACCOUNT_LOCKED")).toBe(true);
    expect(isAccountLocked("INVALID_EMAIL_OR_PASSWORD")).toBe(false);
  });

  it("maps PASSWORD_REUSED and MFA_DISABLE_NOT_ALLOWED", () => {
    expect(authErrorMessage({ code: "PASSWORD_REUSED", status: 400 }, t)).toBe(
      "authError.passwordReused",
    );
    expect(authErrorMessage({ code: "MFA_DISABLE_NOT_ALLOWED", status: 403 }, t)).toBe(
      "account.mfaMustStay",
    );
  });
});

describe("required two-step sign-in", () => {
  const mfa = (o: Partial<{ required: boolean; enabled: boolean; deadline: string | null }>) => ({
    required: true,
    enabled: false,
    deadline: future as string | null,
    ...o,
  });

  it("shows the banner only while required, off and the deadline is ahead", () => {
    expect(showMfaBanner(mfa({}), NOW)).toBe(true);
    expect(showMfaBanner(mfa({ deadline: past }), NOW)).toBe(false);
    expect(showMfaBanner(mfa({ enabled: true }), NOW)).toBe(false);
    expect(showMfaBanner(mfa({ required: false, deadline: null }), NOW)).toBe(false);
    expect(showMfaBanner(mfa({ deadline: null }), NOW)).toBe(false);
    expect(showMfaBanner(undefined, NOW)).toBe(false);
  });

  it("blocks only after the deadline; vendors, enabled users and old APIs never", () => {
    expect(mfaState(mfa({ deadline: past }), NOW)).toBe("blocked");
    expect(mfaState(mfa({}), NOW)).toBe("grace");
    expect(mfaState(mfa({ deadline: null }), NOW)).toBe("grace");
    expect(mfaState(mfa({ deadline: past, enabled: true }), NOW)).toBe("off");
    expect(mfaState({ required: false, enabled: false, deadline: null }, NOW)).toBe("off");
    expect(mfaState(undefined, NOW)).toBe("off");
  });

  it("hides turn-off for required users only", () => {
    expect(canTurnOffMfa(mfa({}))).toBe(false);
    expect(canTurnOffMfa(mfa({ required: false }))).toBe(true);
    expect(canTurnOffMfa(undefined)).toBe(true);
  });

  it("sends people back to a same-origin page, never to the setup page (no loop)", () => {
    expect(mfaReturnTarget("/orders?x=1")).toBe("/orders?x=1");
    expect(mfaReturnTarget("/setup-two-step?redirect=%2F")).toBe("/");
    expect(mfaReturnTarget("//evil.example")).toBe("/");
    expect(mfaReturnTarget("https://evil.example")).toBe("/");
    expect(mfaReturnTarget(undefined)).toBe("/");
  });

  it("recognises MFA_REQUIRED and never retries it", () => {
    const err = { code: "MFA_REQUIRED", status: 403, data: { deadline: past } };
    expect(isMfaRequired(err)).toBe(true);
    expect(isMfaRequired({ code: "FORBIDDEN" })).toBe(false);
    expect(isMfaRequired(null)).toBe(false);
    expect(shouldRetry(0, err)).toBe(false);
    expect(shouldRetry(0, { code: "MFA_REQUIRED" })).toBe(false);
  });
});

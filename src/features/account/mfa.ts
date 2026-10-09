import { AccountLockedBody, type COMMON_ERRORS, type Me } from "@invai/contracts";

/** The oRPC code for "grace is over, turn on two-step sign-in" (the contract owns the literal). */
export const MFA_REQUIRED_CODE = "MFA_REQUIRED" satisfies keyof typeof COMMON_ERRORS;

export type MfaState = "off" | "grace" | "blocked";

/**
 * Where a user stands on required two-step sign-in. Only owners and admins are ever `required`
 * (vendors, floor and sample-workspace owners are not). A missing `mfa` (older API) or an unknown
 * deadline never blocks: the server answers MFA_REQUIRED when it is time.
 */
export function mfaState(mfa: Me["mfa"], now: number = Date.now()): MfaState {
  if (!mfa?.required || mfa.enabled) return "off";
  if (mfa.deadline && new Date(mfa.deadline).getTime() <= now) return "blocked";
  return "grace";
}

/** The grace banner shows only while a known deadline is still ahead. */
export function showMfaBanner(mfa: Me["mfa"], now: number = Date.now()): boolean {
  return mfaState(mfa, now) === "grace" && !!mfa?.deadline;
}

/** True when an error (oRPC or thrown) is the "turn on two-step sign-in" refusal. */
export function isMfaRequired(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === MFA_REQUIRED_CODE;
}

/**
 * Whole minutes (rounded up, at least 1) a locked account must wait. Reads the body field the
 * backend sends (`AccountLockedBody.retryAfterSec`), then the Retry-After header, else null.
 */
export function lockedMinutes(err: unknown, retryAfterHeader?: string | null): number | null {
  const body = AccountLockedBody.safeParse(err);
  let sec: number | null = body.success ? body.data.retryAfterSec : null;
  if (sec === null && err && typeof err === "object") {
    const raw = (err as { retryAfterSec?: unknown }).retryAfterSec;
    if (typeof raw === "number" && Number.isFinite(raw)) sec = raw;
  }
  if (sec === null && retryAfterHeader) {
    const n = Number(retryAfterHeader);
    if (Number.isFinite(n)) sec = n;
  }
  return sec === null ? null : Math.max(1, Math.ceil(sec / 60));
}

/** Required users can't turn two-step sign-in off (the server refuses with MFA_DISABLE_NOT_ALLOWED). */
export function canTurnOffMfa(mfa: Me["mfa"]): boolean {
  return mfa?.required !== true;
}

/**
 * Where to go once two-step sign-in is on: a same-origin path only. The setup page itself is never
 * a target, so coming back can't bounce between the two.
 */
export function mfaReturnTarget(redirect: string | undefined): string {
  if (!redirect?.startsWith("/") || redirect.startsWith("//")) return "/";
  return redirect.startsWith("/setup-two-step") ? "/" : redirect;
}

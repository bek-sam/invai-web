import type { TFunction } from "i18next";

/** The error half of a Better Auth client result (`res.error`), or a thrown error. */
export type AuthErrorLike =
  | { code?: string | null; message?: string | null; status?: number | null }
  | null
  | undefined;

/** Codes whose message is the same wherever they show up. */
export function authErrorMessage(err: AuthErrorLike, t: TFunction, fallback?: string): string {
  if (err?.status === 429) {
    return t("authError.tooMany", "Too many tries. Wait a few minutes, then try again.");
  }
  switch (err?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return t("auth.badCredentials", "Email or password is wrong");
    case "INVALID_PASSWORD":
      return t("authError.wrongPassword", "That password is wrong. Try again.");
    case "PASSWORD_TOO_SHORT":
      return t("authError.passwordShort", "Use at least 8 characters.");
    case "PASSWORD_TOO_LONG":
      return t("authError.passwordLong", "Use at most 128 characters.");
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return t("authError.emailTaken", "That email already has an account. Sign in instead.");
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return t(
        "authError.linkExpired",
        "This link has expired or was already used. Ask for a new one.",
      );
    case "INVALID_CODE":
      return t("authError.wrongCode", "That code is wrong. Check your app and try again.");
    case "INVALID_BACKUP_CODE":
      return t("authError.wrongBackupCode", "That backup code is wrong or was already used.");
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "INVALID_TWO_FACTOR_COOKIE":
      return t("authError.codeExpired", "Too many tries or too much time. Sign in again.");
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return t(
        "authError.locked",
        "Too many wrong codes. Sign-in is paused for 15 minutes for your safety.",
      );
    case "EMAIL_NOT_VERIFIED":
      return t("verifyEmail.needed", "Confirm your email first. Check your inbox for our link.");
    case "EMAIL_ALREADY_VERIFIED":
      return t("verifyEmail.already", "Your email is already confirmed.");
    case "SESSION_NOT_FRESH":
      return t("authError.signInAgain", "For your safety, sign in again to do this.");
    case "TOTP_ALREADY_ENABLED":
      return t("authError.mfaAlreadyOn", "Two-step sign-in is already on.");
  }
  if (err && err.status == null && /fetch|network/i.test(err.message ?? "")) {
    return t("authError.network", "Can't reach InvAI. Check your connection and try again.");
  }
  return fallback ?? t("authError.generic", "Something went wrong. Try again.");
}

/** Codes after which the second sign-in step can't continue: start over with the password. */
export function isChallengeOver(code: string | null | undefined): boolean {
  return code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" || code === "INVALID_TWO_FACTOR_COOKIE";
}

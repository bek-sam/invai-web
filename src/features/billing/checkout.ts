import { errorInfo, upgradeReason } from "../../lib/errors";

type T = (key: string, def: string, opts?: Record<string, unknown>) => string;

/**
 * The toast for a failed checkout or portal call, or null when the app-wide upgrade dialog already
 * explains it. Server text never shows on its own: the title is always ours, translated.
 */
export function billingActionError(
  err: unknown,
  action: "checkout" | "portal",
  t: T,
): { title: string } | null {
  if (upgradeReason(err)) return null;
  const info = errorInfo(err);
  if (info.code === "NOT_IMPLEMENTED") {
    return {
      title:
        action === "portal"
          ? t("billing.portalSoon", "Managing billing online isn't switched on yet.")
          : t("billing.checkoutSoon", "Online payment isn't switched on yet. Try again later."),
    };
  }
  if (info.code === "EMAIL_NOT_VERIFIED") {
    return {
      title: t(
        "billing.verifyEmail",
        "Verify your email before paying. Check your inbox for the link.",
      ),
    };
  }
  if (info.code === "BAD_REQUEST" && action === "portal") {
    return {
      title: t("billing.portalNoAccount", "There's no billing account yet. Choose a plan first."),
    };
  }
  if (info.code === "NETWORK") {
    return {
      title: t("billing.offline", "Can't reach InvAI. Check your connection and try again."),
    };
  }
  return {
    title:
      action === "portal"
        ? t("billing.portalFailed", "Couldn't open billing management. Try again.")
        : t("billing.checkoutFailed", "Couldn't open checkout. Try again."),
  };
}

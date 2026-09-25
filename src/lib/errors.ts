import i18n from "i18next";
import { demoModeMessage } from "../features/demo/demo-mode";

export interface ErrorInfo {
  code: string;
  status: number | null;
  message: string;
  data: unknown;
}

/** Normalizes oRPC errors, Better Auth errors, fetch failures and anything else. */
export function errorInfo(err: unknown): ErrorInfo {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; status?: unknown; message?: unknown; data?: unknown };
    const code = typeof e.code === "string" ? e.code : "UNKNOWN";
    const status = typeof e.status === "number" ? e.status : null;
    let message = typeof e.message === "string" && e.message ? e.message : "Something went wrong";
    if (err instanceof TypeError && /fetch|network/i.test(message)) {
      return { code: "NETWORK", status: null, message: "Can't reach the server", data: null };
    }
    if (code === "NOT_IMPLEMENTED" || status === 501) {
      message = "This part of the API isn't available yet";
      return { code: "NOT_IMPLEMENTED", status: 501, message, data: e.data ?? null };
    }
    if (code === "EMAIL_NOT_VERIFIED") {
      message = tr(
        "verifyEmail.needed",
        "Confirm your email first. Check your inbox for our link.",
      );
      return { code, status, message, data: e.data ?? null };
    }
    if (code === "DEMO_MODE")
      return { code, status, message: demoModeMessage(), data: e.data ?? null };
    const upgrade = upgradeReasonOf(code, e.data);
    if (upgrade) return { code, status, message: upgradeMessage(upgrade), data: e.data ?? null };
    return { code, status, message, data: e.data ?? null };
  }
  return {
    code: "UNKNOWN",
    status: null,
    message: String(err ?? "Something went wrong"),
    data: null,
  };
}

export function errorMessage(err: unknown): string {
  return errorInfo(err).message;
}

export function isUnauthorized(err: unknown): boolean {
  const { code, status } = errorInfo(err);
  return code === "UNAUTHORIZED" || status === 401;
}

/** Retry transient failures only; never auth, permission, validation or not-implemented errors. */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  const { status, code } = errorInfo(err);
  if (code === "NOT_IMPLEMENTED") return false;
  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

export type PlanMeter = "orders" | "aiCredits" | "users" | "connections";

/** Why an action was refused for billing reasons: a plan limit, or no active plan. */
export type UpgradeReason =
  | { kind: "limit"; meter: PlanMeter | null; used: number | null; limit: number | null }
  | { kind: "payment"; checkoutUrl: string | null };

const METERS: Record<string, PlanMeter> = {
  orders: "orders",
  users: "users",
  connections: "connections",
  aiCredits: "aiCredits",
  ai_credits: "aiCredits",
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function upgradeReasonOf(code: string, data: unknown): UpgradeReason | null {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (code === "PLAN_LIMIT_REACHED") {
    // The contract names the field `meter`; the wave plan called it `limit`. Accept either.
    const key = typeof d.meter === "string" ? d.meter : typeof d.limit === "string" ? d.limit : "";
    return { kind: "limit", meter: METERS[key] ?? null, used: num(d.used), limit: num(d.limit) };
  }
  if (code === "CREDITS_EXHAUSTED") {
    return { kind: "limit", meter: "aiCredits", used: null, limit: null };
  }
  if (code === "PAYMENT_REQUIRED") {
    const url = typeof d.checkoutUrl === "string" ? d.checkoutUrl : null;
    return { kind: "payment", checkoutUrl: url };
  }
  return null;
}

/** The billing reason behind an error, or null when it isn't a plan or payment refusal. */
export function upgradeReason(err: unknown): UpgradeReason | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: unknown; data?: unknown };
  return typeof e.code === "string" ? upgradeReasonOf(e.code, e.data) : null;
}

/** Translated when i18n is up (always, in the app); the English default otherwise. */
function tr(key: string, def: string): string {
  const v = i18n.isInitialized ? i18n.t(key, def) : def;
  return typeof v === "string" && v ? v : def;
}

/** One translated line for toasts and error panels; the upgrade dialog says more. */
function upgradeMessage(reason: UpgradeReason): string {
  if (reason.kind === "payment") {
    return tr("upgrade.paymentShort", "This needs an active plan. Go to Billing to choose one.");
  }
  return tr("upgrade.limitShort", "Your plan's limit is reached. Go to Billing to upgrade.");
}

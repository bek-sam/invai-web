import type { BillingStatus, Plan } from "@invai/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingBannerKind =
  | { kind: "trial_ending"; daysLeft: number }
  | { kind: "past_due" }
  | { kind: "trial_expired" };

/** Whole days until `iso` (0 = today or already past). */
export function daysUntil(iso: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS));
}

/**
 * The app-wide billing banner: past due and an expired trial always show; a trial shows in its
 * last 7 days. Everything else (active, cancelled, a long trial) shows nothing.
 */
export function billingBanner(
  status: Pick<BillingStatus, "status" | "trialEndsAt">,
  now = new Date(),
): BillingBannerKind | null {
  if (status.status === "past_due") return { kind: "past_due" };
  if (status.status === "trial_expired") return { kind: "trial_expired" };
  if (status.status === "trialing" && status.trialEndsAt) {
    const daysLeft = daysUntil(status.trialEndsAt, now);
    if (daysLeft <= 7) return { kind: "trial_ending", daysLeft };
  }
  return null;
}

/** Scale has no list price: it's set up by hand. */
export function isCustomPlan(plan: Pick<Plan, "key" | "priceMonthly">): boolean {
  return plan.key !== "trial" && plan.priceMonthly === 0;
}

/** Plans a shop can pick on the billing page, in catalog order (the trial is not one of them). */
export function choosablePlans<P extends Pick<Plan, "key">>(plans: P[]): P[] {
  return plans.filter((p) => p.key !== "trial");
}

export type PlanMove = "current" | "upgrade" | "downgrade" | "custom";

/** How picking `target` relates to the current plan. */
export function planMove(
  current: Pick<Plan, "key" | "priceMonthly">,
  target: Pick<Plan, "key" | "priceMonthly">,
): PlanMove {
  if (target.key === current.key) return "current";
  if (isCustomPlan(target)) return "custom";
  if (isCustomPlan(current)) return "downgrade";
  return target.priceMonthly > current.priceMonthly ? "upgrade" : "downgrade";
}

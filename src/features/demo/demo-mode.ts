import i18n from "i18next";

/**
 * `DEMO_MODE` (403): the API refused a real-money action (Stripe checkout or portal, a plan
 * change) because the current org is a sample shop. Nothing was charged.
 */
export function isDemoModeError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === "DEMO_MODE";
}

const DEFAULT =
  "This is a sample shop, so nothing here can be paid for or charged. Switch to your shop to manage plans and billing.";

/** The translated line to show for a DEMO_MODE refusal. */
export function demoModeMessage(): string {
  const v = i18n.isInitialized ? i18n.t("demo.cantPay", DEFAULT) : DEFAULT;
  return typeof v === "string" && v ? v : DEFAULT;
}

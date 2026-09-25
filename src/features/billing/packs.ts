/**
 * AI credit packs sold as a one-time Stripe payment (`billing.checkout({ pack })`). The keys must
 * match the backend's pack config (T-2-1); the price shows on the Stripe checkout page, because
 * the contract has no pack price list yet.
 */
export const CREDIT_PACKS = [
  { key: "credits_500", credits: 500 },
  { key: "credits_2000", credits: 2000 },
] as const;

export type CreditPackKey = (typeof CREDIT_PACKS)[number]["key"];

import type { Me } from "@invai/contracts";

/**
 * The signed-in person's own sample shop (tenancy.demo), as opposed to a shop that is only
 * flagged `demo` (the seeded Desert Bloom, which has `demo: true` but `demoOwned: false`).
 * Sourced from `companies.demoOwnerUserId` via `Org.demoOwned` (B-110) — no more slug heuristic.
 */
export function isOwnDemo(me: Pick<Me, "org">): boolean {
  return me.org.demoOwned;
}

/** Another company to go back to when leaving the sample shop. */
export function hasOtherCompany(me: Pick<Me, "org" | "orgs">): boolean {
  return me.orgs.some((o) => o.id !== me.org.id);
}

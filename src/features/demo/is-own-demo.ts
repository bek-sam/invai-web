import type { Me } from "@invai/contracts";

/**
 * The signed-in person's own sample shop (tenancy.demo), as opposed to a shop that is only
 * flagged `demo` (the seeded Desert Bloom). The backend names an own sample shop
 * `demo-<company id>` (invai-backend modules/tenancy/demo.ts, createDemoCompany); Org has no
 * explicit field for it yet.
 */
export function isOwnDemo(me: Pick<Me, "org">): boolean {
  return me.org.demo && me.org.slug === `demo-${me.org.id}`;
}

/** Another company to go back to when leaving the sample shop. */
export function hasOtherCompany(me: Pick<Me, "org" | "orgs">): boolean {
  return me.orgs.some((o) => o.id !== me.org.id);
}

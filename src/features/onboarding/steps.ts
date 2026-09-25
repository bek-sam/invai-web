import type { Me } from "@invai/contracts";

export type Checklist = NonNullable<Me["onboarding"]>;

export type ChecklistStepKey = Exclude<keyof Checklist, "dismissed" | "dismissedAt">;

/** The setup steps in the order a new shop usually does them, each with where it's done. */
export const CHECKLIST_STEPS: { key: ChecklistStepKey; to: string }[] = [
  { key: "channelConnected", to: "/settings/channels" },
  { key: "blanksImported", to: "/catalog/blanks" },
  { key: "designsUploaded", to: "/catalog/designs" },
  { key: "skusMapped", to: "/catalog/sku-mapping" },
  { key: "vendorAdded", to: "/settings/vendors" },
  { key: "shipFromAddress", to: "/settings/shipping" },
  { key: "carrier", to: "/settings/shipping" },
  { key: "costsSet", to: "/settings/costs" },
  { key: "staffInvited", to: "/settings/team" },
  { key: "tabletPaired", to: "/settings/stations" },
  { key: "planChosen", to: "/settings/billing" },
];

export function checklistProgress(checklist: Checklist) {
  const done = CHECKLIST_STEPS.filter((s) => checklist[s.key]).length;
  return { done, total: CHECKLIST_STEPS.length, complete: done === CHECKLIST_STEPS.length };
}

/** Shown on Today until every step is done or someone dismisses it. */
export function showChecklist(checklist: Checklist | null | undefined): checklist is Checklist {
  return !!checklist && !checklist.dismissed && !checklistProgress(checklist).complete;
}

/** Nothing set up yet: the moment to offer the sample shop. */
export function isEmptyWorkspace(checklist: Checklist): boolean {
  return !checklist.channelConnected && !checklist.blanksImported && !checklist.designsUploaded;
}

import type { OrderStatus } from "@invai/contracts";

export const ORDER_VIEWS = [
  "all",
  "at_risk",
  "needs_mapping",
  "needs_artwork",
  "ready",
  "on_hold",
] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

/**
 * Saved filter tabs -> orders.list filters. The list filters by order status, so "needs
 * mapping" and "needs artwork" both map to needs_attention (the contract has no item-state
 * filter on orders.list).
 */
export function viewFilters(view: OrderView): { status?: OrderStatus[]; atRisk?: boolean } {
  switch (view) {
    case "at_risk":
      return { atRisk: true };
    case "needs_mapping":
    case "needs_artwork":
      return { status: ["needs_attention"] };
    case "ready":
      return { status: ["new"] };
    case "on_hold":
      return { status: ["on_hold"] };
    default:
      return {};
  }
}

/** Keyboard handling for the orders table, separated so it can be unit-tested. */
export function nextActiveIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "j" || key === "ArrowDown") return Math.min(count - 1, current < 0 ? 0 : current + 1);
  if (key === "k" || key === "ArrowUp") return Math.max(0, current < 0 ? 0 : current - 1);
  if (key === "g") return 0;
  if (key === "G") return count - 1;
  return null;
}

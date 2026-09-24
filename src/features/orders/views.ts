import type { OrderItemState, OrderStatus } from "@invai/contracts";

export const ORDER_VIEWS = [
  "all",
  "at_risk",
  "needs_mapping",
  "needs_artwork",
  "ready",
  "on_hold",
] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

/** Saved filter tabs -> orders.list filters. */
export function viewFilters(view: OrderView): {
  status?: OrderStatus[];
  itemState?: OrderItemState[];
  atRisk?: boolean;
} {
  switch (view) {
    case "at_risk":
      return { atRisk: true };
    case "needs_mapping":
      return { itemState: ["needs_mapping"] };
    case "needs_artwork":
      return { itemState: ["needs_artwork"] };
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

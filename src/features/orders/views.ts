import type {
  OrderCounts as OrderCountsSchema,
  OrderItemState,
  OrderStatus,
} from "@invai/contracts";
import type { z } from "zod";

export type OrderCounts = z.infer<typeof OrderCountsSchema>;

export const ORDER_VIEWS = [
  "all",
  "at_risk",
  "due_today",
  "overdue",
  "blocked",
  "needs_mapping",
  "needs_artwork",
  "ready",
  "in_production",
  "on_hold",
  "shipped",
  "cancelled",
] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

/** Statuses of orders that still have to go out the door. */
export const OPEN_STATUSES: OrderStatus[] = [
  "new",
  "needs_attention",
  "in_production",
  "ready_to_ship",
  "partially_shipped",
  "on_hold",
];

export type ViewFilters = {
  status?: OrderStatus[];
  itemState?: OrderItemState[];
  atRisk?: boolean;
  overdue?: boolean;
  shipByFrom?: string;
  shipByTo?: string;
};

/** Minutes the zone is ahead of UTC at `at` (e.g. -420 for America/Phoenix). */
function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Start of today and start of tomorrow as ISO timestamps, in the shop's time zone when given
 * (so "due today" matches the counts the server computes), or the browser's local day.
 */
export function todayRange(now = new Date(), timeZone?: string): { from: string; to: string } {
  if (!timeZone) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
    const midnight = (day: number) => {
      const guess = Date.UTC(y, m - 1, day);
      // Two passes settle the offset across a DST change.
      let t = guess - zoneOffsetMinutes(timeZone, new Date(guess)) * 60_000;
      t = guess - zoneOffsetMinutes(timeZone, new Date(t)) * 60_000;
      return new Date(t).toISOString();
    };
    return { from: midnight(d), to: midnight(d + 1) };
  } catch {
    return todayRange(now);
  }
}

/** Saved filter tabs -> orders.list filters. */
export function viewFilters(
  view: OrderView,
  opts: { now?: Date; timeZone?: string } = {},
): ViewFilters {
  switch (view) {
    case "at_risk":
      return { atRisk: true };
    case "due_today": {
      const r = todayRange(opts.now, opts.timeZone);
      return { status: OPEN_STATUSES, shipByFrom: r.from, shipByTo: r.to };
    }
    case "overdue":
      return { overdue: true };
    case "blocked":
      return { itemState: ["needs_mapping", "needs_artwork"] };
    case "needs_mapping":
      return { itemState: ["needs_mapping"] };
    case "needs_artwork":
      return { itemState: ["needs_artwork"] };
    case "ready":
      return { status: ["new"] };
    case "in_production":
      return { status: ["in_production", "ready_to_ship"] };
    case "on_hold":
      return { status: ["on_hold"] };
    case "shipped":
      return { status: ["partially_shipped", "shipped", "delivered"] };
    case "cancelled":
      return { status: ["cancelled"] };
    default:
      return {};
  }
}

const sum = (c: OrderCounts | undefined) =>
  c ? Object.values(c.byStatus).reduce<number>((a, b) => a + (b ?? 0), 0) : undefined;

/**
 * The number on each tab. `base` is counts for the current search/channel/tag/date filters;
 * `byItemState` holds counts for the item-state views (one order counts once, whatever its
 * status), since the order rollup can't tell mapping from artwork.
 */
export function tabCount(
  view: OrderView,
  base: OrderCounts | undefined,
  byItemState: Partial<Record<"needs_mapping" | "needs_artwork" | "blocked", OrderCounts>> = {},
): number | undefined {
  if (!base) return undefined;
  const s = base.byStatus;
  switch (view) {
    case "at_risk":
      return base.atRisk;
    case "due_today":
      return base.dueToday;
    case "overdue":
      return base.overdue;
    case "blocked":
    case "needs_mapping":
    case "needs_artwork":
      return sum(byItemState[view]);
    case "ready":
      return s.new;
    case "in_production":
      return (s.in_production ?? 0) + (s.ready_to_ship ?? 0);
    case "on_hold":
      return s.on_hold;
    default:
      return undefined;
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

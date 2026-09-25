import type { Order } from "@invai/contracts";

/** Most rows one export pages through (200 per request). */
export const EXPORT_MAX_ROWS = 5000;

/** Quote a CSV cell; neutralize a leading =, +, - or @ so a spreadsheet won't run it as a formula. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/**
 * The orders in the current view as CSV. Buyer name only (no address or contact details), and
 * headers stay English so imports into other tools don't depend on the viewer's language.
 */
export function ordersCsv(orders: Order[]): string {
  const header = [
    "order_no",
    "channel",
    "status",
    "placed_at",
    "ship_by",
    "rush",
    "at_risk",
    "overdue",
    "buyer",
    "items",
    "total_usd",
    "tags",
    "hold_reason",
  ];
  const rows = orders.map((o) => [
    o.orderNo,
    o.channel,
    o.status,
    o.placedAt,
    o.shipBy,
    o.isRush,
    o.atRisk,
    o.isOverdue,
    o.buyerName,
    o.itemCount,
    dollars(o.totals.total),
    o.tags.join("; "),
    o.hold?.reason ?? "",
  ]);
  return `${[header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

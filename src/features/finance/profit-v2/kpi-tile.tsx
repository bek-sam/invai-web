import { Card, cn } from "@invai/ui";
import type * as React from "react";

/**
 * A plain KPI tile: label, big value, optional caption. `@invai/ui`'s `StatCard` always draws a
 * trend arrow once `delta` is set (no neutral/no-direction state), which doesn't fit a snapshot
 * number like a contribution-margin total, so Profit v2 builds its tiles on `Card` directly
 * (reported to product-designer as a kit gap, not fixed here: web-engineer doesn't edit
 * `invai-ui`). Also guards against B-226: a long Spanish currency string (the non-breaking
 * "12.345,67 US$") gets `min-w-0` on the tile and `break-words` on the value so it wraps instead
 * of overflowing a narrow grid cell.
 */
export function KpiTile({
  label,
  value,
  caption,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 p-4", className)}>
      <p className="truncate text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-2xl font-semibold tabular-nums">{value}</p>
      {caption && <p className="mt-1 truncate text-xs text-muted-foreground">{caption}</p>}
    </Card>
  );
}

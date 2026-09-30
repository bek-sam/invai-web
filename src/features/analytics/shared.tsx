import type { AnalyticsExportInput } from "@invai/contracts";
import { Card, cn, EmptyState, toast } from "@invai/ui";
import { Hourglass } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../lib/errors";
import { client } from "../../lib/rpc";

/**
 * A plain KPI tile, T-A6's `profit-v2/kpi-tile.tsx` pattern copied into this feature (that folder
 * is read-only; `@invai/ui`'s `StatCard` still has no neutral/no-arrow state, reported as a kit
 * gap by T-A6, not fixed here). Same B-226 guard: a long Spanish money string ("12.345,67 US$",
 * non-breaking) must never split mid-number, so the value stays `whitespace-nowrap`. T-A6's own
 * grid gives a tile the full row below `sm`; this feature's grids stay 2-up there (r1 review:
 * "12.441,31 US$" touched the tile edge at 390 px es), so the value starts one size down
 * (`text-lg`) and only grows to T-A6's sizes from `sm` up, where the narrowest 2-up tile is wider.
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
      <p className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-xl md:text-2xl">
        {value}
      </p>
      {caption && <p className="mt-1 truncate text-xs text-muted-foreground">{caption}</p>}
    </Card>
  );
}

/**
 * AC-B/C-screen1: a shop live under 2 weeks (or otherwise below every metric's minimum sample)
 * gets one whole-screen "not enough history yet" state, shown in addition to each widget's own
 * per-metric note (AC-B2's "not enough scans yet", AC-C1's per style/color note) — never instead
 * of them, so the rest of the screen still renders. Same shape as T-A6's `AC-A7` banner
 * (`profit-v2/banners.tsx`, read-only), copied rather than imported.
 */
export function NotEnoughHistoryBanner({ hasEnoughHistory }: { hasEnoughHistory: boolean }) {
  const { t } = useTranslation();
  if (hasEnoughHistory) return null;
  return (
    <div role="status" className="rounded-lg border border-border">
      <EmptyState
        icon={Hourglass}
        title={t("analyticsV2.notEnoughHistory", "Not enough history yet")}
        description={t(
          "analyticsV2.notEnoughHistoryHint",
          "Keep using InvAI for a couple of weeks and these numbers will fill in.",
        )}
      />
    </div>
  );
}

/**
 * Same export pattern as T-A6's `profit-v2/export-csv.ts` (read-only), copied into this feature:
 * presign a key for the view's own filters, then open the download URL (AC-E6).
 */
export function useExportAnalyticsCsv() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  async function run(input: AnalyticsExportInput) {
    setExporting(true);
    try {
      const { key } = await client.analytics.export(input);
      const { url } = await client.files.downloadUrl({ fileKey: key, disposition: "attachment" });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }
  return { exporting, run, label: t("profit.export", "Export CSV") };
}

/**
 * A small, non-virtualized table for a fixed-size cut (reasons, stations, vendors, drivers):
 * `reprints.tsx`'s plain-`<table>` pattern, factored out since Operations and Inventory health
 * each need several of these short lists side by side. Not `DataTable` (that one virtualizes for
 * long lists; these are at most a handful of rows).
 */
export function MiniTable<T>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: {
    key: string;
    header: React.ReactNode;
    cell: (row: T) => React.ReactNode;
    align?: "right";
  }[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn("py-1.5 pr-4 font-medium", c.align === "right" && "text-right")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-border/50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("py-1.5 pr-4", c.align === "right" && "text-right tabular-nums")}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Signed percentage points ("+18.0 pts" / "-18.6 pts"), the spec's unit for `gapPts` and the
 * digest's `points` param — never a ratio or a bare percent (`business-analytics-v2.md` §5 rule
 * 10). Locale-aware for the decimal separator only; "pts" itself doesn't translate (it isn't a
 * word, just the unit tag the spec's own Spanish examples use as-is).
 */
export function formatPoints(n: number | null | undefined, lang: string): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  const num = new Intl.NumberFormat(lang?.startsWith("es") ? "es" : "en", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n);
  return `${sign}${num} pts`;
}

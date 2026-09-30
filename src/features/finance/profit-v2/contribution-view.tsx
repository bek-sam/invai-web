import {
  ANALYTICS_DIMENSIONS,
  type AnalyticsDimension,
  CHANNEL_RULES,
  type Channel,
  type UnitEconomicsRow,
} from "@invai/contracts";
import { Button, DataTable, type DataTableColumn, Money } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, Section } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { formatPctNumberLocale, formatRatioPctLocale } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";
import { OrdersWithoutProfitLineBanner } from "./banners";
import { useExportAnalyticsCsv } from "./export-csv";
import { KpiTile } from "./kpi-tile";

/**
 * AC-A1: the contribution ladder (CM1/CM2/CM3) per dimension, defaulting to "channel" so the
 * per-channel numbers the AC names are what an owner sees first. CM3's total equals the Profit
 * page's Net for the same period, to the cent (parity is proven in the backend test and in this
 * card's report with real seed numbers; both read the same `finance.unitEconomics`/`finance.profit`
 * service).
 */
export function ContributionView({
  period,
  channel,
}: {
  period: { from: string; to: string };
  channel?: Channel;
}) {
  const { t } = useTranslation();
  const [dimension, setDimension] = useState<AnalyticsDimension>("channel");
  const q = useQuery(
    orpc.analytics.unitEconomics.queryOptions({
      input: { period, dimension, channel, limit: 200 },
    }),
  );
  const exportCsv = useExportAnalyticsCsv();
  const columns: DataTableColumn<UnitEconomicsRow>[] = [
    { id: "label", header: t(`profit.dim.${dimension}`, dimension), accessorKey: "label" },
    { accessorKey: "orders", header: t("profit.orders", "Orders") },
    { accessorKey: "units", header: t("profit.units", "Units") },
    {
      accessorKey: "revenue",
      header: t("profit.revenue", "Revenue"),
      cell: ({ row }) => <Money cents={row.original.revenue} />,
    },
    {
      accessorKey: "cm1",
      header: "CM1",
      cell: ({ row }) => <Money cents={row.original.cm1} />,
    },
    {
      id: "cm1Pct",
      header: t("profitV2.margin", "Margin"),
      accessorFn: (r) => r.cm1Pct,
      cell: ({ row }) => formatPctNumberLocale(row.original.cm1Pct),
    },
    {
      accessorKey: "cm2",
      header: "CM2",
      cell: ({ row }) => <Money cents={row.original.cm2} />,
    },
    {
      id: "cm2Pct",
      header: t("profitV2.margin", "Margin"),
      accessorFn: (r) => r.cm2Pct,
      cell: ({ row }) => formatPctNumberLocale(row.original.cm2Pct),
    },
    {
      accessorKey: "cm3",
      header: "CM3",
      cell: ({ row }) => <Money cents={row.original.cm3} className="font-semibold" />,
    },
    {
      id: "cm3Pct",
      header: t("profitV2.margin", "Margin"),
      accessorFn: (r) => r.cm3Pct,
      cell: ({ row }) => formatPctNumberLocale(row.original.cm3Pct),
    },
    {
      id: "estimated",
      header: t("profitV2.estimated", "Estimated"),
      accessorFn: (r) => r.estimatedShare,
      cell: ({ row }) => formatRatioPctLocale(row.original.estimatedShare),
    },
  ];
  return (
    <Section
      title={t("profitV2.contribution", "Contribution")}
      description={t(
        "profitV2.contributionHint",
        "Contribution margin after product costs (CM1), fulfilment (CM2) and ads (CM3).",
      )}
      actions={
        <>
          <NativeSelect
            aria-label={t("profitV2.dimension", "Group by")}
            value={dimension}
            onChange={(e) => setDimension(e.target.value as AnalyticsDimension)}
          >
            {ANALYTICS_DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {t(`profit.dim.${d}`, d)}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.exporting}
            onClick={() =>
              void exportCsv.run({ view: "unitEconomics", period, dimension, channel })
            }
          >
            {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {exportCsv.label}
          </Button>
        </>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <OrdersWithoutProfitLineBanner count={q.data?.ordersWithoutProfitLine ?? 0} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <KpiTile
              label={t("profit.revenue", "Revenue")}
              value={q.data ? <Money cents={q.data.totals.revenue} /> : "—"}
            />
            <KpiTile
              label="CM1"
              value={q.data ? <Money cents={q.data.totals.cm1} /> : "—"}
              caption={q.data ? formatPctNumberLocale(q.data.totals.cm1Pct) : undefined}
            />
            <KpiTile
              label="CM2"
              value={q.data ? <Money cents={q.data.totals.cm2} /> : "—"}
              caption={q.data ? formatPctNumberLocale(q.data.totals.cm2Pct) : undefined}
            />
            <KpiTile
              label="CM3"
              value={q.data ? <Money cents={q.data.totals.cm3} /> : "—"}
              caption={q.data ? formatPctNumberLocale(q.data.totals.cm3Pct) : undefined}
            />
          </div>
          <DataTable
            columns={columns as DataTableColumn<UnitEconomicsRow, unknown>[]}
            data={q.data?.rows ?? []}
            getRowId={(r) => r.key}
            isLoading={q.isPending}
            emptyTitle={t("profit.noData", "No orders in this period")}
            maxHeight="28rem"
          />
          {channel && (
            <p className="text-xs text-muted-foreground">
              {t("profitV2.filteredByChannel", "Filtered to {{channel}}", {
                channel: CHANNEL_RULES[channel].label,
              })}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

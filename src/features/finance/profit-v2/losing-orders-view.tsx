import type { Channel, LosingOrder } from "@invai/contracts";
import { Button, ChannelBadge, DataTable, type DataTableColumn, Money } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { formatDate, formatPctNumberLocale, orderLabel } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";
import { OrdersWithoutProfitLineBanner } from "./banners";
import { useExportAnalyticsCsv } from "./export-csv";
import { KpiTile } from "./kpi-tile";
import { costLineLabel } from "./labels";

/** AC-A2: order number, CM2 and the largest cost line; the backend never returns a positive-CM2 row. */
export function LosingOrdersView({
  period,
  channel,
}: {
  period: { from: string; to: string };
  channel?: Channel;
}) {
  const { t } = useTranslation();
  const q = useQuery(
    orpc.analytics.losingOrders.queryOptions({ input: { period, channel, limit: 50 } }),
  );
  const exportCsv = useExportAnalyticsCsv();
  const columns: DataTableColumn<LosingOrder>[] = [
    {
      id: "orderNo",
      header: t("orders.order", "Order"),
      accessorFn: (r) => r.orderNo,
      cell: ({ row }) => <span className="font-medium">{orderLabel(row.original.orderNo)}</span>,
    },
    {
      accessorKey: "channel",
      header: t("orders.channel", "Channel"),
      cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
    },
    {
      id: "design",
      header: t("profit.dim.design", "design"),
      accessorFn: (r) => r.designName ?? "—",
    },
    {
      accessorKey: "placedAt",
      header: t("orders.placed", "Placed"),
      cell: ({ row }) => formatDate(row.original.placedAt),
    },
    { accessorKey: "units", header: t("profit.units", "Units") },
    {
      accessorKey: "revenue",
      header: t("profit.revenue", "Revenue"),
      cell: ({ row }) => <Money cents={row.original.revenue} />,
    },
    {
      accessorKey: "cm2",
      header: "CM2",
      cell: ({ row }) => <Money cents={row.original.cm2} className="font-semibold" />,
    },
    {
      id: "largestCostLine",
      header: t("profitV2.largestCostLine", "Biggest cost"),
      cell: ({ row }) => (
        <span>
          {costLineLabel(t, row.original.largestCostLine)}{" "}
          <Money cents={-row.original.largestCostLineCents} className="text-muted-foreground" />
        </span>
      ),
    },
  ];
  return (
    <Section
      title={t("profitV2.losingOrders", "Orders that lost money")}
      description={t(
        "profitV2.losingOrdersHint",
        "Orders whose contribution after fulfilment costs (CM2) is negative, worst first.",
      )}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={exportCsv.exporting}
          onClick={() => void exportCsv.run({ view: "losingOrders", period, channel })}
        >
          {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {exportCsv.label}
        </Button>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <OrdersWithoutProfitLineBanner count={q.data?.ordersWithoutProfitLine ?? 0} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <KpiTile
              label={t("profitV2.losingOrdersCount", "Losing orders")}
              value={q.data?.losingOrders ?? "—"}
            />
            <KpiTile
              label={t("profitV2.losingPct", "Share of orders")}
              value={q.data ? formatPctNumberLocale(q.data.losingPct) : "—"}
            />
            <KpiTile
              label={t("profitV2.lossCents", "Total lost")}
              value={q.data ? <Money cents={q.data.lossCents} /> : "—"}
            />
          </div>
          <DataTable
            columns={columns as DataTableColumn<LosingOrder, unknown>[]}
            data={q.data?.orders ?? []}
            getRowId={(r) => r.orderId}
            isLoading={q.isPending}
            emptyTitle={t("profitV2.noLosingOrders", "No losing orders in this period")}
            maxHeight="28rem"
          />
        </div>
      )}
    </Section>
  );
}

import {
  type Channel,
  SHIPPING_MARGIN_GROUPS,
  type ShippingMarginGroup,
  type ShippingMarginRow,
} from "@invai/contracts";
import { Button, DataTable, type DataTableColumn, EmptyState, Money } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, PackageX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { orpc } from "../../../lib/rpc";
import { useExportAnalyticsCsv } from "./export-csv";
import { KpiTile } from "./kpi-tile";

/**
 * AC-A3: shipping charged minus label cost, by channel/service/weight band/zone. Zero labeled
 * shipments in the period shows a plain "no shipments yet" state, never a $0 margin that reads
 * as good news.
 */
export function ShippingMarginView({
  period,
  channel,
}: {
  period: { from: string; to: string };
  channel?: Channel;
}) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<ShippingMarginGroup>("channel");
  const q = useQuery(
    orpc.analytics.shippingMargin.queryOptions({ input: { period, groupBy, channel } }),
  );
  const exportCsv = useExportAnalyticsCsv();
  const columns: DataTableColumn<ShippingMarginRow>[] = [
    { id: "label", header: t(`profitV2.groupBy.${groupBy}`, groupBy), accessorKey: "label" },
    { accessorKey: "labeledOrders", header: t("profitV2.labeledOrders", "Labeled orders") },
    {
      accessorKey: "charged",
      header: t("profitV2.charged", "Charged"),
      cell: ({ row }) => <Money cents={row.original.charged} />,
    },
    {
      accessorKey: "labelCost",
      header: t("profit.labelCost", "Label"),
      cell: ({ row }) => <Money cents={-row.original.labelCost} />,
    },
    {
      accessorKey: "margin",
      header: t("profitV2.margin", "Margin"),
      cell: ({ row }) => <Money cents={row.original.margin} className="font-semibold" />,
    },
    {
      accessorKey: "marginPerOrder",
      header: t("profitV2.marginPerOrder", "Margin / order"),
      cell: ({ row }) =>
        row.original.marginPerOrder === null ? "—" : <Money cents={row.original.marginPerOrder} />,
    },
    { accessorKey: "freeShippingOrders", header: t("profitV2.freeShipping", "Free shipping") },
  ];
  return (
    <Section
      title={t("profitV2.shippingMargin", "Shipping profit")}
      description={t(
        "profitV2.shippingMarginHint",
        "Shipping charged to the buyer minus postage and label fees, for InvAI-labeled orders.",
      )}
      actions={
        <>
          <NativeSelect
            aria-label={t("profitV2.groupByLabel", "Group by")}
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as ShippingMarginGroup)}
          >
            {SHIPPING_MARGIN_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`profitV2.groupBy.${g}`, g)}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.exporting}
            onClick={() => void exportCsv.run({ view: "shippingMargin", period, groupBy, channel })}
          >
            {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {exportCsv.label}
          </Button>
        </>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <SkeletonRows rows={6} />
      ) : q.data.totals.labeledOrders === 0 ? (
        <EmptyState
          icon={PackageX}
          title={t("profitV2.noLabeledShipments", "No labeled shipments yet in this period")}
          description={t(
            "profitV2.noLabeledShipmentsHint",
            "Buy shipping labels through InvAI to see shipping profit here.",
          )}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiTile
              label={t("profitV2.labeledOrders", "Labeled orders")}
              value={q.data.totals.labeledOrders}
            />
            <KpiTile
              label={t("profitV2.charged", "Charged")}
              value={<Money cents={q.data.totals.charged} />}
            />
            <KpiTile
              label={t("profit.labelCost", "Label")}
              value={<Money cents={-q.data.totals.labelCost} />}
            />
            <KpiTile
              label={t("profitV2.margin", "Margin")}
              value={<Money cents={q.data.totals.margin} />}
            />
            <KpiTile
              label={t("profitV2.freeShipping", "Free shipping")}
              value={q.data.totals.freeShippingOrders}
            />
          </div>
          <DataTable
            columns={columns as DataTableColumn<ShippingMarginRow, unknown>[]}
            data={q.data.rows}
            getRowId={(r) => r.key}
            emptyTitle={t("profit.noData", "No orders in this period")}
            maxHeight="28rem"
          />
          {groupBy === "zone" && q.data.shipmentsWithoutZone > 0 && (
            <p className="text-xs text-muted-foreground">
              {t(
                "profitV2.shipmentsWithoutZone",
                "{{n}} labeled shipments have no zone on record yet and aren't in these rows.",
                { n: q.data.shipmentsWithoutZone },
              )}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

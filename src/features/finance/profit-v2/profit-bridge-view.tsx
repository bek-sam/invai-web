import {
  type Channel,
  PROFIT_BRIDGE_BY,
  type ProfitBridgeBy,
  type ProfitBridgeMover,
} from "@invai/contracts";
import { Button, DataTable, type DataTableColumn, EmptyState, Money } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Scale } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { formatDate } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";
import { useExportAnalyticsCsv } from "./export-csv";
import { KpiTile } from "./kpi-tile";

/** AC1's "Why it changed": the bridge from the previous equal-length period to this one, split
 * into volume (sold more or fewer) and rate (each sale earned more or less), plus the top 10 movers. */
export function ProfitBridgeView({
  period,
  channel,
}: {
  period: { from: string; to: string };
  channel?: Channel;
}) {
  const { t } = useTranslation();
  const [by, setBy] = useState<ProfitBridgeBy>("design");
  const q = useQuery(orpc.analytics.profitBridge.queryOptions({ input: { period, by, channel } }));
  const exportCsv = useExportAnalyticsCsv();
  const columns: DataTableColumn<ProfitBridgeMover>[] = [
    { id: "label", header: t(`profitV2.by.${by}`, by), accessorKey: "label" },
    {
      accessorKey: "baseCm3",
      header: t("profitV2.baseCm3", "Before"),
      cell: ({ row }) => <Money cents={row.original.baseCm3} />,
    },
    {
      accessorKey: "currentCm3",
      header: t("profitV2.currentCm3", "Now"),
      cell: ({ row }) => <Money cents={row.original.currentCm3} />,
    },
    {
      accessorKey: "change",
      header: t("profitV2.change", "Change"),
      cell: ({ row }) => <Money cents={row.original.change} showSign className="font-semibold" />,
    },
    {
      accessorKey: "volumePart",
      header: t("profitV2.volumePart", "From volume"),
      cell: ({ row }) => <Money cents={row.original.volumePart} showSign />,
    },
    {
      accessorKey: "ratePart",
      header: t("profitV2.ratePart", "From rate"),
      cell: ({ row }) => <Money cents={row.original.ratePart} showSign />,
    },
  ];
  return (
    <Section
      title={t("profitV2.profitBridge", "Why it changed")}
      description={t(
        "profitV2.profitBridgeHint",
        "Net profit versus the previous equal-length period, split into selling more or fewer units and each sale earning more or less.",
      )}
      actions={
        <>
          <NativeSelect
            aria-label={t("profitV2.byLabel", "Rank movers by")}
            value={by}
            onChange={(e) => setBy(e.target.value as ProfitBridgeBy)}
          >
            {PROFIT_BRIDGE_BY.map((b) => (
              <option key={b} value={b}>
                {t(`profitV2.by.${b}`, b)}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.exporting}
            onClick={() => void exportCsv.run({ view: "profitBridge", period, by, channel })}
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
      ) : !q.data.hasEnoughOrders ? (
        <EmptyState
          icon={Scale}
          title={t("profitV2.notEnoughOrders", "Not enough orders to explain")}
          description={t(
            "profitV2.notEnoughOrdersHint",
            "{{base}} orders before, {{current}} orders now; both periods need at least 20.",
            { base: q.data.baseOrders, current: q.data.currentOrders },
          )}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {t("profitV2.comparedTo", "Compared with {{from}}–{{to}}", {
              from: formatDate(q.data.basePeriod.from),
              to: formatDate(q.data.basePeriod.to),
            })}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiTile
              label={t("profitV2.baseCm3", "Before")}
              value={<Money cents={q.data.baseCm3} />}
            />
            <KpiTile
              label={t("profitV2.currentCm3", "Now")}
              value={<Money cents={q.data.currentCm3} />}
            />
            <KpiTile
              label={t("profitV2.totalChange", "Total change")}
              value={<Money cents={q.data.totalChange} showSign />}
            />
            <KpiTile
              label={t("profitV2.volumePart", "From volume")}
              value={<Money cents={q.data.volumePart} showSign />}
            />
            <KpiTile
              label={t("profitV2.ratePart", "From rate")}
              value={<Money cents={q.data.ratePart} showSign />}
            />
          </div>
          {q.data.refundsChange !== 0 && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {t(
                "profitV2.refundsChange",
                "Refunds also changed (dated by refund, not sale; not part of the total above):",
              )}
              <Money cents={q.data.refundsChange} showSign />
            </p>
          )}
          <DataTable
            columns={columns as DataTableColumn<ProfitBridgeMover, unknown>[]}
            data={q.data.topMovers}
            getRowId={(r) => r.key}
            emptyTitle={t("profit.noData", "No orders in this period")}
            maxHeight="24rem"
          />
        </div>
      )}
    </Section>
  );
}

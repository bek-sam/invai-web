import { Button } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { NativeSelect, Page } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { InventoryHealthView } from "../../../features/analytics/inventory-health-view";
import { useExportAnalyticsCsv } from "../../../features/analytics/shared";
import { SupplierTrendsView } from "../../../features/analytics/supplier-trends-view";
import { lastNDays } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";

const DAY_WINDOWS = [30, 90, 180] as const;
const TREND_PERIODS = [90, 180, 365] as const;

export const Route = createFileRoute("/_app/analytics/inventory")({
  validateSearch: z.object({
    days: z.coerce.number().optional().catch(undefined),
    trendDays: z.coerce.number().optional().catch(undefined),
  }),
  component: InventoryPage,
});

/** AC-C1/C2/C4/C5/screen1: on-hand value and turns, dead stock, size-mix gaps, stockout exposure
 * and supplier trends -- everything a shop needs to decide what to reorder and from whom. */
function InventoryPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/analytics/inventory" });
  const days = DAY_WINDOWS.includes(search.days as never) ? (search.days as number) : 90;
  const trendDays = TREND_PERIODS.includes(search.trendDays as never)
    ? (search.trendDays as number)
    : 180;
  const trendPeriod = useMemo(
    () => lastNDays(trendDays, new Date(Math.floor(Date.now() / 60_000) * 60_000)),
    [trendDays],
  );
  const exportCsv = useExportAnalyticsCsv();
  const health = useQuery(orpc.analytics.inventoryHealth.queryOptions({ input: { days } }));
  const trends = useQuery(
    orpc.analytics.supplierTrends.queryOptions({ input: { period: trendPeriod } }),
  );
  return (
    <Page
      title={t("nav.inventoryHealth", "Inventory health")}
      description={t(
        "invV2.subtitle",
        "On-hand value, turns, dead stock, size-mix gaps and supplier trends.",
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("invV2.health", "Inventory health")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label={t("invV2.window", "Window")}
              value={days}
              onChange={(e) =>
                void navigate({
                  search: (p) => ({ ...p, days: Number(e.target.value) }),
                  replace: true,
                })
              }
            >
              {DAY_WINDOWS.map((d) => (
                <option key={d} value={d}>
                  {t("profit.lastDays", "Last {{n}} days", { n: d })}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              size="sm"
              disabled={exportCsv.exporting}
              onClick={() => void exportCsv.run({ view: "inventoryHealth", days })}
            >
              {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {exportCsv.label}
            </Button>
          </div>
        </div>
        {health.isError ? (
          <ErrorState error={health.error} onRetry={() => void health.refetch()} />
        ) : health.isPending ? (
          <SkeletonRows rows={8} />
        ) : (
          <InventoryHealthView data={health.data} />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <NativeSelect
            aria-label={t("profit.period", "Period")}
            value={trendDays}
            onChange={(e) =>
              void navigate({
                search: (p) => ({ ...p, trendDays: Number(e.target.value) }),
                replace: true,
              })
            }
          >
            {TREND_PERIODS.map((d) => (
              <option key={d} value={d}>
                {t("profit.lastDays", "Last {{n}} days", { n: d })}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.exporting}
            onClick={() => void exportCsv.run({ view: "supplierTrends", period: trendPeriod })}
          >
            {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {exportCsv.label}
          </Button>
        </div>
        {trends.isError ? (
          <ErrorState error={trends.error} onRetry={() => void trends.refetch()} />
        ) : trends.isPending ? (
          <SkeletonRows rows={6} />
        ) : (
          <SupplierTrendsView data={trends.data} />
        )}
      </div>
    </Page>
  );
}

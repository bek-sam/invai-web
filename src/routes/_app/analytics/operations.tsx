import { CHANNEL_RULES, CHANNELS, type Channel } from "@invai/contracts";
import { Button } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { NativeSelect, Page } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { OperationsView } from "../../../features/analytics/operations-view";
import { useExportAnalyticsCsv } from "../../../features/analytics/shared";
import { lastNDays } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";

const PERIODS = [7, 30, 90] as const;

export const Route = createFileRoute("/_app/analytics/operations")({
  validateSearch: z.object({
    days: z.coerce.number().optional().catch(undefined),
    channel: z.enum(CHANNELS).optional().catch(undefined),
  }),
  component: OperationsPage,
});

/** AC-B1/B2/B3/screen1: reprints, film waste, waits, press minutes and late-shipment drivers. */
function OperationsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/analytics/operations" });
  const days = PERIODS.includes(search.days as never) ? (search.days as number) : 30;
  const period = useMemo(
    () => lastNDays(days, new Date(Math.floor(Date.now() / 60_000) * 60_000)),
    [days],
  );
  const channel = search.channel;
  const exportCsv = useExportAnalyticsCsv();
  const q = useQuery(orpc.analytics.operations.queryOptions({ input: { period, channel } }));
  return (
    <Page
      title={t("nav.operations", "Operations")}
      description={t(
        "opsV2.subtitle",
        "Reprints, film waste, waits and late-shipment drivers, by station and vendor.",
      )}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={t("profit.period", "Period")}
            value={days}
            onChange={(e) =>
              void navigate({
                search: (p) => ({ ...p, days: Number(e.target.value) }),
                replace: true,
              })
            }
          >
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                {t("profit.lastDays", "Last {{n}} days", { n: d })}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t("orders.channel", "Channel")}
            value={channel ?? ""}
            onChange={(e) =>
              void navigate({
                search: (p) => ({
                  ...p,
                  channel: e.target.value ? (e.target.value as Channel) : undefined,
                }),
                replace: true,
              })
            }
          >
            <option value="">{t("profitV2.allChannels", "All channels")}</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_RULES[c].label}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.exporting}
            onClick={() => void exportCsv.run({ view: "operations", period, channel })}
          >
            {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {exportCsv.label}
          </Button>
        </div>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <SkeletonRows rows={8} />
      ) : (
        <OperationsView data={q.data} />
      )}
    </Page>
  );
}

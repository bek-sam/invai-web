import type { Channel, LeakageStep } from "@invai/contracts";
import { Button, Money } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { formatPctNumberLocale } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";
import { OrdersWithoutProfitLineBanner } from "./banners";
import { useExportAnalyticsCsv } from "./export-csv";
import { KpiTile } from "./kpi-tile";
import { leakageComponentLabel } from "./labels";

/** AC1's "Leakage waterfall": gross sales down to contribution, step by step. */
export function LeakageView({
  period,
  channel,
}: {
  period: { from: string; to: string };
  channel?: Channel;
}) {
  const { t } = useTranslation();
  const q = useQuery(orpc.analytics.leakage.queryOptions({ input: { period, channel } }));
  const exportCsv = useExportAnalyticsCsv();
  return (
    <Section
      title={t("profitV2.leakage", "Leakage waterfall")}
      description={t(
        "profitV2.leakageHint",
        "Gross sales, then what's taken out before contribution: discounts, fees, refunds, shipping loss and reprints.",
      )}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={exportCsv.exporting}
          onClick={() => void exportCsv.run({ view: "leakage", period, channel })}
        >
          {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {exportCsv.label}
        </Button>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="flex flex-col gap-4">
          <OrdersWithoutProfitLineBanner count={q.data.ordersWithoutProfitLine} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiTile
              label={t("profitV2.grossSales", "Gross sales")}
              value={<Money cents={q.data.grossSales} />}
            />
            <KpiTile
              label={t("profitV2.leakagePct", "Leakage")}
              value={formatPctNumberLocale(q.data.leakagePct)}
            />
            <KpiTile
              label={t("profitV2.remaining", "Remaining (contribution)")}
              value={<Money cents={q.data.remaining} />}
            />
          </div>
          {q.data.grossSales === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("profit.noData", "No orders in this period")}
            </p>
          ) : (
            <WaterfallBars grossSales={q.data.grossSales} steps={q.data.waterfall} t={t} />
          )}
        </div>
      )}
    </Section>
  );
}

function WaterfallBars({
  grossSales,
  steps,
  t,
}: {
  grossSales: number;
  steps: LeakageStep[];
  t: TFunction;
}) {
  const max = Math.max(grossSales, 1);
  return (
    <div className="flex flex-col gap-2">
      <Row
        label={t("profitV2.grossSales", "Gross sales")}
        cents={grossSales}
        max={max}
        tone="base"
      />
      {steps.map((s) => (
        <Row
          key={s.component}
          label={leakageComponentLabel(t, s.component)}
          cents={-s.cents}
          max={max}
          tone="down"
          caption={formatPctNumberLocale(s.pctOfGross)}
        />
      ))}
    </div>
  );
}

function Row({
  label,
  cents,
  max,
  tone,
  caption,
}: {
  label: string;
  cents: number;
  max: number;
  tone: "base" | "down";
  caption?: string;
}) {
  const width = Math.min(100, (Math.abs(cents) / max) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 truncate text-muted-foreground">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
        <div
          className={tone === "base" ? "h-full bg-primary" : "h-full bg-danger"}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-28 shrink-0 text-right font-medium tabular-nums">
        <Money cents={cents} />
      </span>
      {caption && <span className="w-16 shrink-0 text-right text-muted-foreground">{caption}</span>}
    </div>
  );
}

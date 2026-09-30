import { Button, Money } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { formatNumber } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";
import { useExportAnalyticsCsv } from "./export-csv";
import { KpiTile } from "./kpi-tile";

/**
 * AC-A6: no fixed costs set -> a prompt linking to Settings → Costs, no number shown at all
 * (never a break-even guess from an empty setting). Below the 30-order minimum, a distinct
 * "not enough orders yet" note, per the same "counts next to a threshold" rule as the other views.
 */
export function BreakEvenView({ period }: { period: { from: string; to: string } }) {
  const { t } = useTranslation();
  const q = useQuery(orpc.analytics.breakEven.queryOptions({ input: { period } }));
  const exportCsv = useExportAnalyticsCsv();
  return (
    <Section
      title={t("profitV2.breakEven", "Break-even")}
      description={t(
        "profitV2.breakEvenHint",
        "Orders per month needed to cover the shop's fixed monthly costs, and the current pace.",
      )}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={exportCsv.exporting}
          onClick={() => void exportCsv.run({ view: "breakEven", period })}
        >
          {exportCsv.exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {exportCsv.label}
        </Button>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <SkeletonRows rows={4} />
      ) : !q.data.fixedCostsSet ? (
        <div className="flex flex-col items-start gap-3 py-8 text-center sm:items-center">
          <p className="text-sm text-muted-foreground">
            {t("profitV2.addFixedCosts", "Add your monthly fixed costs to see break-even")}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/costs">{t("nav.costs", "Costs")}</Link>
          </Button>
        </div>
      ) : !q.data.hasEnoughOrders ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t(
            "profitV2.breakEvenNotEnoughOrders",
            "Not enough orders yet to show break-even ({{n}} of 30 needed this period)",
            { n: q.data.orders },
          )}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            label={t("profitV2.fixedMonthlyCents", "Fixed monthly costs")}
            value={<Money cents={q.data.fixedMonthlyCents ?? 0} />}
          />
          <KpiTile
            label={t("profitV2.cm3PerOrder", "Net profit / order")}
            value={q.data.cm3PerOrder === null ? "—" : <Money cents={q.data.cm3PerOrder} />}
          />
          <KpiTile
            label={t("profitV2.breakEvenOrders", "Break-even orders / month")}
            value={q.data.breakEvenOrders === null ? "—" : formatNumber(q.data.breakEvenOrders)}
          />
          <KpiTile
            label={t("profitV2.pace", "Current pace / month")}
            value={q.data.pace === null ? "—" : formatNumber(q.data.pace)}
          />
          <KpiTile
            label={t("profitV2.operatingProfitPace", "Operating profit pace / month")}
            value={
              q.data.operatingProfitPace === null ? (
                "—"
              ) : (
                <Money cents={q.data.operatingProfitPace} showSign />
              )
            }
            className="col-span-2"
          />
        </div>
      )}
    </Section>
  );
}

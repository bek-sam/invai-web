import { cn, Money } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ErrorState, SkeletonRows } from "../../components/states";
import { formatPct } from "../../lib/format";
import { orpc } from "../../lib/rpc";

/** Every cost line for one order, marking which are estimates. */
export function OrderProfitBreakdown({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const q = useQuery(orpc.finance.orderProfit.queryOptions({ input: { orderId } }));
  if (q.isPending) return <SkeletonRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />;
  const p = q.data;
  const est = new Set<string>(p.estimated);
  const rows: [string, number, string | null][] = [
    [t("profit.revenue", "Revenue"), p.revenue, null],
    [t("profit.channelFees", "Channel fees"), -p.channelFees, "channelFees"],
    [t("profit.blankCost", "Blanks"), -p.blankCost, "blankCost"],
    [t("profit.transferCost", "Transfers"), -p.transferCost, "transferCost"],
    [t("profit.labelCost", "Label"), -p.labelCost, "labelCost"],
    [t("profit.packagingCost", "Packaging"), -p.packagingCost, null],
    [t("profit.laborCost", "Labor"), -p.laborCost, null],
    [t("profit.adsCost", "Ads"), -p.adsCost, "adsCost"],
    [t("profit.refunds", "Refunds"), -p.refunds, null],
  ];
  return (
    <div className="flex flex-col gap-3 text-sm">
      <table className="w-full">
        <tbody>
          {rows.map(([label, cents, key]) => (
            <tr key={label} className="border-b border-border/60">
              <td className="py-1.5">
                {label}
                {key && est.has(key) && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({t("profit.estimate", "estimate")})
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right">
                <Money cents={cents} />
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="pt-2">{t("profit.net", "Net profit")}</td>
            <td className={cn("pt-2 text-right", p.net < 0 && "text-danger")}>
              <Money cents={p.net} />{" "}
              <span className="font-normal text-muted-foreground">({formatPct(p.marginPct)})</span>
            </td>
          </tr>
        </tbody>
      </table>
      {p.feeBreakdown.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t("profit.feeBreakdown", "Fee breakdown")}
          </p>
          <ul className="text-xs text-muted-foreground">
            {p.feeBreakdown.map((f) => (
              <li key={f.label} className="flex justify-between">
                <span>{f.label}</span>
                <Money cents={f.amount} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">{t("profit.item", "Item")}</th>
                <th className="py-1 text-right font-medium">{t("profit.revenue", "Revenue")}</th>
                <th className="py-1 text-right font-medium">{t("profit.costs", "Costs")}</th>
                <th className="py-1 text-right font-medium">{t("profit.net", "Net")}</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.orderItemId} className="border-t border-border/60">
                  <td className="py-1">
                    {l.designName} · {l.blankLabel}
                    {l.isReprint && (
                      <span className="ml-1 text-warning">({t("profit.reprint", "reprint")})</span>
                    )}
                  </td>
                  <td className="py-1 text-right">
                    <Money cents={l.revenue} />
                  </td>
                  <td className="py-1 text-right">
                    <Money cents={-(l.revenue - l.net)} />
                  </td>
                  <td className="py-1 text-right">
                    <Money cents={l.net} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import type { DigestGlanceItem, GlanceMetric } from "@invai/contracts";
import { Card, cn } from "@invai/ui";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { glanceChangeDirection } from "./digest-copy";

const METRIC_KEY: Record<GlanceMetric, string> = {
  revenue: "digest.glance.revenue",
  net: "digest.glance.net",
  marginPct: "digest.glance.marginPct",
  orders: "digest.glance.orders",
  onTimeRate: "digest.glance.onTimeRate",
};

const METRIC_DEFAULT: Record<GlanceMetric, string> = {
  revenue: "Revenue",
  net: "Net profit",
  marginPct: "Margin",
  orders: "Orders",
  onTimeRate: "On-time rate",
};

/**
 * One glance tile. Not `@invai/ui`'s `StatCard`: that component always draws an arrow whenever
 * `delta` is set (`deltaDirection` only picks the color/icon, it can't turn the arrow off), so a
 * zero-change "unchanged" / "sin cambio" value would still show a green up arrow (wave 20 gate
 * issue 3, caught by QA's acceptance e2e). Built locally on the same `Card` primitive and reported
 * to the product-designer as a gap for the kit; everything else matches `StatCard`'s look.
 */
function GlanceTile({
  label,
  value,
  delta,
  direction,
  warn,
}: {
  label: string;
  value: string;
  delta?: string;
  direction: "up" | "down" | null;
  warn: boolean;
}) {
  return (
    <Card className={cn("border p-4", warn ? "border-warning/40" : "border-border")}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {delta && (
        <p
          className={cn(
            "mt-1 inline-flex items-center gap-0.5 text-xs font-medium",
            direction === "up"
              ? "text-success"
              : direction === "down"
                ? "text-danger"
                : "text-muted-foreground",
          )}
        >
          {direction === "up" && <ArrowUp className="size-3" aria-hidden />}
          {direction === "down" && <ArrowDown className="size-3" aria-hidden />}
          {delta}
        </p>
      )}
    </Card>
  );
}

/** The fixed 5-metric glance block (spec step 6). Every number is the backend's own formatted fact. */
export function DigestGlanceGrid({
  items,
  className,
}: {
  items: DigestGlanceItem[];
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {items.map((item) => (
        <GlanceTile
          key={item.metric}
          label={t(METRIC_KEY[item.metric], METRIC_DEFAULT[item.metric])}
          value={item.current.formatted[lang]}
          delta={item.change ? item.change.formatted[lang] : undefined}
          direction={glanceChangeDirection(item.changePct)}
          warn={item.metric === "onTimeRate" && item.changePct != null && item.changePct < 0}
        />
      ))}
    </div>
  );
}

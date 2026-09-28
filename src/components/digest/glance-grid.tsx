import type { DigestGlanceItem, GlanceMetric } from "@invai/contracts";
import { cn, StatCard } from "@invai/ui";
import { useTranslation } from "react-i18next";

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
        <StatCard
          key={item.metric}
          label={t(METRIC_KEY[item.metric], METRIC_DEFAULT[item.metric])}
          value={item.current.formatted[lang]}
          delta={item.change ? item.change.formatted[lang] : undefined}
          deltaDirection={item.changePct == null ? undefined : item.changePct >= 0 ? "up" : "down"}
          tone={
            item.metric === "onTimeRate" && item.changePct != null && item.changePct < 0
              ? "warning"
              : "neutral"
          }
        />
      ))}
    </div>
  );
}

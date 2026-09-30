import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * AC-A7: any CM or leakage view that reports `ordersWithoutProfitLine` shows this instead of a
 * silently partial total. Renders nothing when the count is 0, so a clean period stays quiet.
 */
export function OrdersWithoutProfitLineBanner({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm text-foreground"
    >
      <Info className="size-4 shrink-0 text-info" aria-hidden />
      {t("profitV2.ordersWithoutProfitLine", "{{n}} orders aren't in these numbers yet", {
        n: count,
      })}
    </p>
  );
}

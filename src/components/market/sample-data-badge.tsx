import { Badge, cn } from "@invai/ui";
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Spec copy `badge.sample`. Shown next to any answer or recommendation whose tool results carry
 * `mock: true` (AC3, AC30) — never hidden in a tooltip.
 */
export function SampleDataBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="info" className={cn(className)}>
      <FlaskConical className="size-3" aria-hidden />
      {t("assistant.badge.sample", "Sample data")}
    </Badge>
  );
}

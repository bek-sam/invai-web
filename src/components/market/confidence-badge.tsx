import type { ConfidenceBand } from "@invai/contracts";
import { Badge, cn } from "@invai/ui";
import { CircleHelp, FlaskConical, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Local component: `invai-ui` has no shared confidence-band treatment yet (product-designer's
 * spec review, non-blocking note). Built here per `add-ui-component`'s consumer rule ("build it
 * locally, report it"); reported in the T-18-5 report for the designer to promote into the kit.
 *
 * Never color alone: an icon and the fixed band text (spec copy `band.high/medium/low`) always
 * ride with the tone (high -> success, medium -> warning, low -> neutral).
 */
const BAND_VARIANT: Record<ConfidenceBand, "success" | "warning" | "outline"> = {
  high: "success",
  medium: "warning",
  low: "outline",
};

const BAND_ICON = {
  high: ShieldCheck,
  medium: FlaskConical,
  low: CircleHelp,
} as const;

export function ConfidenceBadge({ band, className }: { band: ConfidenceBand; className?: string }) {
  const { t } = useTranslation();
  const Icon = BAND_ICON[band];
  const label = t(
    `market.band.${band}`,
    {
      high: "High confidence",
      medium: "Medium confidence: test it",
      low: "Not enough data",
    }[band],
  );
  return (
    <Badge variant={BAND_VARIANT[band]} className={cn(className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  );
}

import type { PoState } from "@invai/contracts";
import { Badge } from "@invai/ui";
import { useTranslation } from "react-i18next";

const TONE: Record<
  PoState,
  "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info"
> = {
  draft: "secondary",
  submitting: "secondary",
  submitted: "info",
  partially_received: "warning",
  received: "success",
  cancelled: "outline",
};

export function PoStatusBadge({ status }: { status: PoState }) {
  const { t } = useTranslation();
  return <Badge variant={TONE[status]}>{t(`poState.${status}`, status.replace(/_/g, " "))}</Badge>;
}

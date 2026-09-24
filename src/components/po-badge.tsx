import type { PoState } from "@invai/contracts";
import { Badge } from "@invai/ui";
import { useTranslation } from "react-i18next";

const TONE = { draft: "secondary", submitted: "info", partially_received: "warning", received: "success", cancelled: "outline" } as const;

export function PoStatusBadge({ status }: { status: PoState }) {
  const { t } = useTranslation();
  return <Badge variant={TONE[status]}>{t(`poState.${status}`, status.replace(/_/g, " "))}</Badge>;
}

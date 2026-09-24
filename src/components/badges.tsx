import type { OrderStatus, SheetState, ShipmentState } from "@invai/contracts";
import { Badge } from "@invai/ui";
import { useTranslation } from "react-i18next";

type Tone = "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info";

const ORDER_TONE: Record<OrderStatus, Tone> = {
  new: "secondary",
  needs_attention: "warning",
  in_production: "info",
  ready_to_ship: "info",
  partially_shipped: "info",
  shipped: "success",
  delivered: "success",
  on_hold: "danger",
  cancelled: "outline",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={ORDER_TONE[status]}>
      {t(`orderStatus.${status}`, status.replace(/_/g, " "))}
    </Badge>
  );
}

const SHEET_TONE: Record<SheetState, Tone> = {
  building: "secondary",
  ready: "info",
  sent: "warning",
  acknowledged: "warning",
  printed: "info",
  shipped: "info",
  received: "success",
  failed: "danger",
  cancelled: "outline",
};

export function SheetStatusBadge({ status }: { status: SheetState }) {
  const { t } = useTranslation();
  return <Badge variant={SHEET_TONE[status]}>{t(`sheetState.${status}`, status)}</Badge>;
}

const SHIPMENT_TONE: Record<ShipmentState, Tone> = {
  pending: "secondary",
  rated: "secondary",
  labeled: "info",
  in_transit: "info",
  delivered: "success",
  exception: "danger",
  returned: "warning",
  voided: "outline",
};

export function ShipmentStatusBadge({ status }: { status: ShipmentState }) {
  const { t } = useTranslation();
  return (
    <Badge variant={SHIPMENT_TONE[status]}>
      {t(`shipmentState.${status}`, status.replace(/_/g, " "))}
    </Badge>
  );
}

/** Generic status badge for smaller state sets (POs, drafts, QA, connections). */
export function ToneBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <Badge variant={tone}>{children}</Badge>;
}

export const QA_TONE: Record<"pending" | "passed" | "warn" | "failed", Tone> = {
  pending: "secondary",
  passed: "success",
  warn: "warning",
  failed: "danger",
};

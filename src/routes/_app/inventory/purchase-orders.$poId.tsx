import type { PurchaseOrder } from "@invai/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Money,
  Skeleton,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Ban, Loader2, PackageCheck, Pencil, Send, Stamp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { DefList, Field, Section } from "../../../components/page";
import { blankLabel } from "../../../components/pickers";
import { PoStatusBadge } from "../../../components/po-badge";
import { ErrorState } from "../../../components/states";
import { PoFormDialog } from "../../../features/inventory/po-form-dialog";
import { formatDateTime } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/inventory/purchase-orders/$poId")({
  component: PoPage,
});

function PoPage() {
  const { t } = useTranslation();
  const { poId } = Route.useParams();
  const q = useQuery(orpc.inventory.purchaseOrders.get.queryOptions({ input: { id: poId } }));
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/inventory/purchase-orders">
          <ArrowLeft />
          {t("nav.purchaseOrders")}
        </Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <PoView key={q.data.updatedAt} po={q.data} />
      )}
    </div>
  );
}

function PoView({ po }: { po: PurchaseOrder }) {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const [receive, setReceive] = useState<Record<string, string>>({});
  const [receiptKey, setReceiptKey] = useState(() => crypto.randomUUID());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.inventory.key() });
  const submit = useMutation(
    orpc.inventory.purchaseOrders.submit.mutationOptions({
      onSuccess: () => {
        toast.success(t("po.submitted", "Sent to the supplier"));
        invalidate();
      },
    }),
  );
  const rec = useMutation(
    orpc.inventory.purchaseOrders.receive.mutationOptions({
      onSuccess: () => {
        toast.success(t("po.receivedToast", "Received into stock"));
        setReceive({});
        // A fresh key for the next receipt; retries of this one keep reusing `receiptKey`.
        setReceiptKey(crypto.randomUUID());
        invalidate();
      },
    }),
  );
  const cancel = useMutation(
    orpc.inventory.purchaseOrders.cancel.mutationOptions({
      onSuccess: () => {
        setCancelOpen(false);
        invalidate();
      },
    }),
  );
  const canReceive =
    can("purchasing.receive") && (po.status === "submitted" || po.status === "partially_received");
  const lines = Object.entries(receive)
    .map(([lineId, v]) => ({ lineId, qty: Number.parseInt(v, 10) }))
    .filter((l) => l.qty > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{po.poNo}</h1>
          <PoStatusBadge status={po.status} />
        </div>
        <div className="flex gap-2">
          {po.status === "draft" && can("purchasing.manage") && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil />
              {t("action.edit")}
            </Button>
          )}
          {po.status === "draft" && can("purchasing.manage") && (
            <Button onClick={() => submit.mutate({ id: po.id })} disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {t("po.submit", "Submit to supplier")}
            </Button>
          )}
          {po.status === "draft" && can("purchasing.manage") && (
            <Button variant="outline" onClick={() => setPlacing(true)}>
              <Stamp />
              {t("po.markPlaced", "Mark placed by phone/email")}
            </Button>
          )}
          {canReceive && (
            <Button
              variant="outline"
              onClick={() =>
                setReceive(
                  Object.fromEntries(
                    po.lines.map((l) => [l.id, String(Math.max(0, l.qty - l.receivedQty))]),
                  ),
                )
              }
            >
              {t("po.fillRemaining", "Fill remaining")}
            </Button>
          )}
          {(po.status === "draft" || po.status === "submitted") && can("purchasing.manage") && (
            <Button variant="ghost" className="text-danger" onClick={() => setCancelOpen(true)}>
              <Ban />
              {t("action.cancel")}
            </Button>
          )}
        </div>
      </div>
      <Section>
        <DefList
          items={[
            [t("blanks.supplier", "Supplier"), t(`supplier.${po.supplier}`, po.supplier)],
            [t("po.supplierOrder", "Supplier order"), po.supplierOrderId ?? "—"],
            [t("po.expected", "Expected"), formatDateTime(po.expectedAt)],
            [t("po.submittedAt", "Submitted"), formatDateTime(po.submittedAt)],
            [t("po.notes", "Notes"), po.notes ?? "—"],
          ]}
        />
      </Section>
      <Section title={t("po.lines", "Lines")}>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t("orders.blank", "Blank")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("stock.qty", "Qty")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("po.received", "Received")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("po.unitCost", "Unit")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("stock.lineCost", "Cost")}</th>
                {canReceive && (
                  <th className="px-4 py-2 text-right font-medium">
                    {t("po.receiveNow", "Receive now")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-1.5">{blankLabel(l.blank)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.qty}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.receivedQty}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Money cents={l.unitCost} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Money cents={l.unitCost * l.qty} />
                  </td>
                  {canReceive && (
                    <td className="px-4 py-1.5 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={l.qty - l.receivedQty}
                        className="ml-auto h-8 w-20 text-right"
                        value={receive[l.id] ?? ""}
                        onChange={(e) => setReceive({ ...receive, [l.id]: e.target.value })}
                        aria-label={t("po.receiveNow", "Receive now")}
                        disabled={l.receivedQty >= l.qty}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-t border-border">
                <td className="px-4 py-1.5 text-muted-foreground" colSpan={4}>
                  {t("orders.subtotal", "Subtotal")}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Money cents={po.subtotal} />
                </td>
              </tr>
              <tr>
                <td className="px-4 py-1.5 text-muted-foreground" colSpan={4}>
                  {t("po.freight", "Freight")}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Money cents={po.freight} />
                </td>
              </tr>
              <tr className="font-semibold">
                <td className="px-4 py-1.5" colSpan={4}>
                  {t("orders.total", "Total")}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Money cents={po.total} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {canReceive && (
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() =>
                rec.mutate({
                  purchaseOrderId: po.id,
                  lines,
                  note: null,
                  idempotencyKey: receiptKey,
                })
              }
              disabled={lines.length === 0 || rec.isPending}
            >
              {rec.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
              {t("po.receive", "Receive {{count}} units", {
                count: lines.reduce((s, l) => s + l.qty, 0),
              })}
            </Button>
          </div>
        )}
      </Section>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("po.cancelTitle", "Cancel {{no}}?", { no: po.poNo })}
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate({ id: po.id })}
      />
      {editing && <PoFormDialog po={po} onClose={() => setEditing(false)} />}
      {placing && (
        <MarkPlacedDialog po={po} onClose={() => setPlacing(false)} onDone={invalidate} />
      )}
    </div>
  );
}

/** AC2: for suppliers with no ordering API, record that the order was placed by phone/email. */
function MarkPlacedDialog({
  po,
  onClose,
  onDone,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [ref, setRef] = useState("");
  const markPlaced = useMutation(
    orpc.inventory.purchaseOrders.markPlaced.mutationOptions({
      onSuccess: () => {
        toast.success(t("po.placedToast", "Marked placed"));
        onDone();
        onClose();
      },
    }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("po.markPlacedTitle", "Mark {{no}} placed", { no: po.poNo })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "po.markPlacedHint",
              "For a supplier with no ordering API: record the order you placed by phone or email.",
            )}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("po.supplierOrder", "Supplier order")} htmlFor="po-placed-ref">
          <Input
            id="po-placed-ref"
            autoFocus
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={t("po.supplierOrderPlaceholder", "Their order or confirmation number")}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => markPlaced.mutate({ id: po.id, supplierOrderRef: ref.trim() })}
            disabled={!ref.trim() || markPlaced.isPending}
          >
            {markPlaced.isPending && <Loader2 className="animate-spin" />}
            {t("po.markPlacedConfirm", "Mark placed")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

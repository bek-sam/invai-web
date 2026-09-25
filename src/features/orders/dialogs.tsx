import {
  type BlankVariant,
  CANCEL_REASONS,
  type Design,
  HOLD_REASONS,
  type OrderItem,
  type OrderWithItems,
  PLACEMENTS,
} from "@invai/contracts";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect } from "../../components/page";
import { BlankPicker, DesignPicker } from "../../components/pickers";
import { errorMessage } from "../../lib/errors";
import { client, orpc } from "../../lib/rpc";

export function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.orders.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.orderItems.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.today.key() }),
    ]);
}

export function HoldDialog({
  orderIds,
  open,
  onOpenChange,
  onDone,
}: {
  orderIds: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateOrders();
  const [reason, setReason] = useState<(typeof HOLD_REASONS)[number]>("address_check");
  const [note, setNote] = useState("");
  const hold = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        orderIds.map((id) => orpcClientHold(id, reason, note.trim() || null)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === results.length) throw (results[0] as PromiseRejectedResult).reason;
      return { ok: results.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      toast.success(t("orders.heldToast", "{{count}} order(s) on hold", { count: ok }), {
        description: failed
          ? t("orders.someFailed", "{{count}} failed", { count: failed })
          : undefined,
      });
      void invalidate();
      onOpenChange(false);
      onDone?.();
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("orders.holdTitle", "Put {{count}} order(s) on hold", { count: orderIds.length })}
          </DialogTitle>
          <DialogDescription>
            {t("orders.holdHint", "Held items stop moving through production until released.")}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("orders.reason", "Reason")} htmlFor="hold-reason">
          <NativeSelect
            id="hold-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
          >
            {HOLD_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`holdReason.${r}`, r.replace(/_/g, " "))}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("orders.note", "Note")} htmlFor="hold-note">
          <Textarea
            id="hold-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button onClick={() => hold.mutate()} disabled={hold.isPending}>
            {hold.isPending && <Loader2 className="animate-spin" />}
            {t("orders.hold", "Hold")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function orpcClientHold(id: string, reason: (typeof HOLD_REASONS)[number], note: string | null) {
  return client.orders.hold({ id, reason, note });
}

export function CancelDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderWithItems;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateOrders();
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number]>("buyer_request");
  const [note, setNote] = useState("");
  const openItems = order.items.filter(
    (i) => !["shipped", "delivered", "cancelled"].includes(i.state),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(openItems.map((i) => i.id)));
  const cancel = useMutation(
    orpc.orders.cancel.mutationOptions({
      onSuccess: () => {
        toast.success(t("orders.cancelledToast", "Order #{{no}} cancelled", { no: order.orderNo }));
        void invalidate();
        onOpenChange(false);
      },
    }),
  );
  const partial = selected.size > 0 && selected.size < openItems.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("orders.cancelTitle", "Cancel order #{{no}}", { no: order.orderNo })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "orders.cancelHint",
              "Transfers already on a sheet are marked scrap and reserved blanks return to stock.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
          {openItems.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.has(i.id)}
                onCheckedChange={(v) => {
                  const next = new Set(selected);
                  if (v) next.add(i.id);
                  else next.delete(i.id);
                  setSelected(next);
                }}
              />
              <span className="truncate">
                {i.title} {i.variantTitle ? `· ${i.variantTitle}` : ""} ({i.unitNo}/{i.unitsInLine})
              </span>
            </label>
          ))}
        </div>
        <Field label={t("orders.reason", "Reason")} htmlFor="cancel-reason">
          <NativeSelect
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
          >
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`cancelReason.${r}`, r.replace(/_/g, " "))}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("orders.note", "Note")} htmlFor="cancel-note">
          <Textarea
            id="cancel-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.back")}
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending || selected.size === 0}
            onClick={() =>
              cancel.mutate({
                id: order.id,
                reason,
                note: note.trim() || null,
                orderItemIds: partial ? [...selected] : undefined,
              })
            }
          >
            {cancel.isPending && <Loader2 className="animate-spin" />}
            {partial
              ? t("orders.cancelItems", "Cancel {{count}} item(s)", { count: selected.size })
              : t("orders.cancelOrder", "Cancel order")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The one-time manual map for a needs_mapping item, optionally learning a SKU rule. */
export function MapItemDialog({
  item,
  channel,
  open,
  onOpenChange,
}: {
  item: OrderItem;
  channel: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateOrders();
  const queryClient = useQueryClient();
  const [design, setDesign] = useState<Design | null>(null);
  const [blank, setBlank] = useState<BlankVariant | null>(null);
  const [placement, setPlacement] = useState<string>("");
  const [applyToSameSku, setApplyToSameSku] = useState(true);
  const [saveRule, setSaveRule] = useState(true);
  const map = useMutation(
    orpc.orderItems.map.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          t("orders.mappedToast", "Mapped {{count}} item(s)", { count: res.itemsMapped }),
          {
            description: res.ruleId
              ? t("orders.ruleSaved", "Rule saved; future orders map themselves.")
              : undefined,
          },
        );
        void invalidate();
        void queryClient.invalidateQueries({ queryKey: orpc.skuRules.key() });
        onOpenChange(false);
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("orders.mapTitle", "Map SKU {{sku}}", { sku: item.channelSku })}
          </DialogTitle>
          <DialogDescription>
            {item.title}
            {item.variantTitle ? ` · ${item.variantTitle}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("orders.design", "Design")}>
          <DesignPicker value={design} onChange={setDesign} />
        </Field>
        <Field label={t("orders.blank", "Blank")}>
          <BlankPicker value={blank} onChange={setBlank} />
        </Field>
        <Field label={t("orders.placement", "Placement")} htmlFor="map-placement">
          <NativeSelect
            id="map-placement"
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
          >
            <option value="">{t("orders.placementDefault", "Design default")}</option>
            {PLACEMENTS.map((p) => (
              <option key={p} value={p}>
                {t(`placement.${p}`, p.replace(/_/g, " "))}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={applyToSameSku} onCheckedChange={(v) => setApplyToSameSku(!!v)} />
          {t("orders.applySameSku", "Apply to other open items with this SKU")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={saveRule} onCheckedChange={(v) => setSaveRule(!!v)} />
          {t("orders.saveRule", "Remember this SKU (save a mapping rule)")}
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!design || !blank || map.isPending}
            onClick={() => {
              if (!design || !blank) return;
              map.mutate({
                id: item.id,
                designId: design.id,
                blankVariantId: blank.id,
                placement: (placement || undefined) as never,
                applyToSameSku,
                saveRule: saveRule
                  ? {
                      name: null,
                      patternType: "exact",
                      pattern: item.channelSku,
                      channel: channel as never,
                      connectionId: null,
                      target: { kind: "direct", designId: design.id, blankVariantId: blank.id },
                      priority: 0,
                      active: true,
                    }
                  : undefined,
              });
            }}
          >
            {map.isPending && <Loader2 className="animate-spin" />}
            {t("orders.map", "Map item")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel several whole orders at once, after a confirmation that names the count. */
export function BulkCancelDialog({
  orders,
  open,
  onOpenChange,
  onDone,
}: {
  orders: { id: string; orderNo: string }[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateOrders();
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number]>("buyer_request");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState<{ orderNo: string; message: string }[]>([]);
  const cancel = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        orders.map((o) => client.orders.cancel({ id: o.id, reason, note: note.trim() || null })),
      );
      const bad = results.flatMap((r, i) =>
        r.status === "rejected"
          ? [{ orderNo: orders[i]?.orderNo ?? "", message: errorMessage(r.reason) }]
          : [],
      );
      return { ok: results.length - bad.length, bad };
    },
    onSuccess: ({ ok, bad }) => {
      void invalidate();
      if (ok > 0)
        toast.success(t("orders.bulkCancelled", "{{count}} order(s) cancelled", { count: ok }));
      setFailed(bad);
      if (bad.length === 0) {
        onOpenChange(false);
        onDone?.();
      }
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setFailed([]);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("orders.bulkCancelTitle", "Cancel {{count}} order(s)?", { count: orders.length })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "orders.bulkCancelHint",
              "Every open unit is cancelled. Transfers already on a sheet are marked scrap, reserved blanks return to stock, and unshipped labels are voided. This can't be undone.",
            )}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("orders.reason", "Reason")} htmlFor="bulk-cancel-reason">
          <NativeSelect
            id="bulk-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
          >
            {CANCEL_REASONS.filter((r) => r !== "channel_cancelled").map((r) => (
              <option key={r} value={r}>
                {t(`cancelReason.${r}`, r.replace(/_/g, " "))}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("orders.note", "Note")} htmlFor="bulk-cancel-note">
          <Textarea
            id="bulk-cancel-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </Field>
        {failed.length > 0 && (
          <div role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            <p className="font-medium">
              {t("orders.bulkCancelFailed", "{{count}} order(s) couldn't be cancelled:", {
                count: failed.length,
              })}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {failed.map((f) => (
                <li key={f.orderNo}>
                  #{f.orderNo.replace(/^#+/, "")}: {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.back")}
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending || orders.length === 0}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending && <Loader2 className="animate-spin" />}
            {t("orders.bulkCancelConfirm", "Cancel {{count}} order(s)", { count: orders.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

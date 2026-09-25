import type { BlankVariant, PurchaseOrder, Supplier } from "@invai/contracts";
import { SUPPLIERS } from "@invai/contracts";
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
  Textarea,
  toast,
} from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect } from "../../components/page";
import { BlankPicker, blankLabel } from "../../components/pickers";
import { centsToDollarsInput, parseDollarsToCents } from "../../lib/format";
import { orpc } from "../../lib/rpc";

type LineBlank = { brand: string; style: string; color: string; size: string };
type Line = { blankVariantId: string; blank: LineBlank; qty: string; unitCost: string };

/** Create a draft PO, or edit one while it's still a draft (T-6-1 AC1). */
export function PoFormDialog({ po, onClose }: { po: PurchaseOrder | null; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = useState<Supplier>(po?.supplier ?? "ssactivewear");
  const [notes, setNotes] = useState(po?.notes ?? "");
  const [freight, setFreight] = useState(po ? centsToDollarsInput(po.freight) : "0.00");
  const [picked, setPicked] = useState<BlankVariant | null>(null);
  const [lines, setLines] = useState<Line[]>(
    po?.lines.map((l) => ({
      blankVariantId: l.blankVariantId,
      blank: l.blank,
      qty: String(l.qty),
      unitCost: centsToDollarsInput(l.unitCost),
    })) ?? [],
  );

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.inventory.key() });
  const done = (saved: PurchaseOrder) => {
    toast.success(
      po
        ? t("po.saved", "Purchase order saved")
        : t("po.created", "Draft PO {{no}} created", { no: saved.poNo }),
    );
    invalidate();
    onClose();
    if (!po) {
      void navigate({ to: "/inventory/purchase-orders/$poId", params: { poId: saved.id } });
    }
  };
  const create = useMutation(
    orpc.inventory.purchaseOrders.create.mutationOptions({ onSuccess: done }),
  );
  const update = useMutation(
    orpc.inventory.purchaseOrders.update.mutationOptions({ onSuccess: done }),
  );
  const pending = create.isPending || update.isPending;

  function addLine() {
    if (!picked || lines.some((l) => l.blankVariantId === picked.id)) return;
    setLines([
      ...lines,
      {
        blankVariantId: picked.id,
        blank: { brand: picked.brand, style: picked.style, color: picked.color, size: picked.size },
        qty: "1",
        unitCost: centsToDollarsInput(picked.cost),
      },
    ]);
    setPicked(null);
  }
  function setLine(id: string, patch: Partial<Line>) {
    setLines(lines.map((l) => (l.blankVariantId === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines(lines.filter((l) => l.blankVariantId !== id));
  }

  const payloadLines = lines.map((l) => ({
    blankVariantId: l.blankVariantId,
    qty: Number.parseInt(l.qty, 10),
    unitCost: parseDollarsToCents(l.unitCost) ?? undefined,
  }));
  const linesValid =
    payloadLines.length > 0 && payloadLines.every((l) => Number.isInteger(l.qty) && l.qty > 0);
  const freightCents = parseDollarsToCents(freight);
  const subtotal = lines.reduce(
    (s, l) => s + (Number.parseInt(l.qty, 10) || 0) * (parseDollarsToCents(l.unitCost) ?? 0),
    0,
  );

  function save() {
    if (freightCents === null) return;
    if (po) {
      update.mutate({
        id: po.id,
        supplier,
        lines: payloadLines,
        freight: freightCents,
        notes: notes.trim() || null,
      });
    } else {
      create.mutate({
        supplier,
        lines: payloadLines,
        freight: freightCents,
        expectedAt: null,
        notes: notes.trim() || null,
      });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {po
              ? t("po.editTitle", "Edit {{no}}", { no: po.poNo })
              : t("po.newTitle", "New purchase order")}
          </DialogTitle>
          <DialogDescription>
            {t("po.newHint", "Pick a supplier, then add lines by style, color and size.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("blanks.supplier", "Supplier")} htmlFor="po-supplier">
              <NativeSelect
                id="po-supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value as Supplier)}
              >
                {SUPPLIERS.map((s) => (
                  <option key={s} value={s}>
                    {t(`supplier.${s}`, s)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label={t("po.freight", "Freight")}
              htmlFor="po-freight"
              error={
                freightCents === null ? t("po.freightInvalid", "Enter a dollar amount") : undefined
              }
            >
              <Input
                id="po-freight"
                inputMode="decimal"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
              />
            </Field>
          </div>
          <Field label={t("po.addLine", "Add a blank")}>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <BlankPicker value={picked} onChange={setPicked} />
              </div>
              <Button type="button" variant="outline" onClick={addLine} disabled={!picked}>
                <Plus />
                {t("action.add", "Add")}
              </Button>
            </div>
          </Field>
          {lines.length > 0 && (
            <div className="-mx-1 overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("orders.blank", "Blank")}
                    </th>
                    <th className="px-2 py-2 text-right font-medium">{t("stock.qty", "Qty")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("po.unitCost", "Unit")}</th>
                    <th className="w-8">
                      <span className="sr-only">{t("action.delete")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.blankVariantId} className="border-t border-border">
                      <td className="px-3 py-1.5">{blankLabel(l.blank)}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={1}
                          className="ml-auto h-8 w-20 text-right"
                          value={l.qty}
                          onChange={(e) => setLine(l.blankVariantId, { qty: e.target.value })}
                          aria-label={t("stock.qty", "Qty")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          inputMode="decimal"
                          className="ml-auto h-8 w-24 text-right"
                          value={l.unitCost}
                          onChange={(e) => setLine(l.blankVariantId, { unitCost: e.target.value })}
                          aria-label={t("po.unitCost", "Unit")}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-danger"
                          onClick={() => removeLine(l.blankVariantId)}
                          aria-label={t("action.delete")}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Field label={t("po.notes", "Notes")} htmlFor="po-notes">
            <Textarea
              id="po-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
            {t("orders.subtotal", "Subtotal")}:
            <Money cents={subtotal} className="font-medium text-foreground" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button onClick={save} disabled={!linesValid || freightCents === null || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { DEFAULT_SHEET_SPEC, type SheetSpec, type VendorConnection } from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, PackageCheck, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { DefList, Field, NativeSelect, Page } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { centsToDollarsInput, formatInches, parseDollarsToCents } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/vendors")({
  component: VendorsPage,
});

function VendorsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can("vendors.manage");
  const queryClient = useQueryClient();
  const q = useQuery(orpc.vendors.list.queryOptions({ input: {} }));
  const [editing, setEditing] = useState<VendorConnection | "new" | null>(null);
  const [removing, setRemoving] = useState<VendorConnection | null>(null);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.vendors.key() });
  const setDefault = useMutation(
    orpc.vendors.setDefault.mutationOptions({ onSuccess: invalidate }),
  );
  const remove = useMutation(
    orpc.vendors.remove.mutationOptions({
      onSuccess: () => {
        setRemoving(null);
        invalidate();
      },
    }),
  );
  return (
    <Page
      wide={false}
      title={t("nav.vendors")}
      description={t(
        "vendors.subtitle",
        "DTF vendors that print your gang sheets. Vendors on InvAI get sheets in their portal; others by email.",
      )}
      actions={
        manage && (
          <Button onClick={() => setEditing("new")}>
            <Plus />
            {t("vendors.invite", "Invite vendor")}
          </Button>
        )
      }
    >
      {q.isPending ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={PackageCheck}
            title={t("vendors.none", "No vendors yet")}
            description={t("vendors.noneHint", "Invite the DTF shop that prints your transfers.")}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {q.data.items.map((v) => (
            <Card key={v.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{v.name}</p>
                {v.isDefault && <Badge>{t("sheets.default", "default")}</Badge>}
                <Badge
                  variant={
                    v.status === "active"
                      ? "success"
                      : v.status === "invited"
                        ? "warning"
                        : "outline"
                  }
                >
                  {t(`vendorStatus.${v.status}`, v.status)}
                </Badge>
                <Badge variant="secondary">
                  {v.delivery === "portal"
                    ? t("vendors.portal", "Portal")
                    : t("vendors.email", "Email")}
                </Badge>
                <span className="text-sm text-muted-foreground">{v.email}</span>
                {manage && (
                  <div className="ml-auto flex gap-1">
                    {!v.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDefault.mutate({ id: v.id })}
                      >
                        <Star />
                        {t("company.makeDefault", "Make default")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(v)}>
                      {t("vendors.spec", "Sheet spec")}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-danger"
                      onClick={() => setRemoving(v)}
                      aria-label={t("action.delete")}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
              <DefList
                className="sm:grid-cols-[max-content_1fr_max-content_1fr]"
                items={[
                  [
                    t("vendors.sheetSize", "Sheet"),
                    `${formatInches(v.spec.widthIn)} × ${t("vendors.upTo", "up to")} ${formatInches(v.spec.maxLengthIn)}`,
                  ],
                  [
                    t("vendors.price", "Price"),
                    `$${centsToDollarsInput(v.spec.pricePerInch)}/${t("vendors.inch", "inch")}`,
                  ],
                  [
                    t("vendors.format", "Format"),
                    `${v.spec.format.toUpperCase()} · ${v.spec.dpi} DPI`,
                  ],
                  [
                    t("vendors.turnaround", "Turnaround"),
                    t("ship.days", "{{n}} days", { n: v.turnaroundDays }),
                  ],
                  [t("vendors.openSheets", "Open sheets"), v.sheetsOpen],
                ]}
              />
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <VendorDialog
          vendor={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={invalidate}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("vendors.removeTitle", "Remove {{name}}?", { name: removing?.name ?? "" })}
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate({ id: removing.id })}
      />
    </Page>
  );
}

function VendorDialog({
  vendor,
  onClose,
  onDone,
}: {
  vendor: VendorConnection | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(vendor?.name ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [isDefault, setIsDefault] = useState(vendor?.isDefault ?? true);
  const [turnaround, setTurnaround] = useState(String(vendor?.turnaroundDays ?? 2));
  const [spec, setSpec] = useState<SheetSpec>(vendor?.spec ?? DEFAULT_SHEET_SPEC);
  const [price, setPrice] = useState(centsToDollarsInput(spec.pricePerInch));
  const done = () => {
    toast.success(
      vendor ? t("settings.saved", "Settings saved") : t("vendors.invited", "Vendor invited"),
    );
    onDone();
    onClose();
  };
  const invite = useMutation(orpc.vendors.invite.mutationOptions({ onSuccess: done }));
  const update = useMutation(orpc.vendors.update.mutationOptions({ onSuccess: done }));
  const cents = parseDollarsToCents(price);
  const fullSpec = { ...spec, pricePerInch: cents ?? spec.pricePerInch };
  const num = (k: keyof SheetSpec) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSpec({ ...spec, [k]: Number(e.target.value) });
  const pending = invite.isPending || update.isPending;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{vendor ? vendor.name : t("vendors.invite", "Invite vendor")}</DialogTitle>
          <DialogDescription>
            {t(
              "vendors.specHint",
              "The sheet spec drives nesting and the file sent to the vendor.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t("designs.name", "Name")} htmlFor="v-name">
            <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("auth.email", "Email")} htmlFor="v-email">
            <Input
              id="v-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!vendor}
            />
          </Field>
          <Field label={t("vendors.turnaroundDays", "Turnaround (days)")} htmlFor="v-turn">
            <Input
              id="v-turn"
              type="number"
              min={0}
              value={turnaround}
              onChange={(e) => setTurnaround(e.target.value)}
            />
          </Field>
          <Field label={t("vendors.widthIn", "Sheet width (in)")} htmlFor="v-w">
            <Input
              id="v-w"
              type="number"
              step="0.5"
              value={spec.widthIn}
              onChange={num("widthIn")}
            />
          </Field>
          <Field label={t("vendors.maxLength", "Max length (in)")} htmlFor="v-l">
            <Input id="v-l" type="number" value={spec.maxLengthIn} onChange={num("maxLengthIn")} />
          </Field>
          <Field label={t("vendors.pricePerInch", "Price per inch ($)")} htmlFor="v-p">
            <Input
              id="v-p"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label={t("vendors.format", "Format")} htmlFor="v-f">
            <NativeSelect
              id="v-f"
              value={spec.format}
              onChange={(e) => setSpec({ ...spec, format: e.target.value as SheetSpec["format"] })}
            >
              <option value="png">PNG</option>
              <option value="pdf">PDF</option>
            </NativeSelect>
          </Field>
          <Field label="DPI" htmlFor="v-dpi">
            <Input id="v-dpi" type="number" value={spec.dpi} onChange={num("dpi")} />
          </Field>
          <Field label={t("vendors.spacing", "Spacing (in)")} htmlFor="v-s">
            <Input
              id="v-s"
              type="number"
              step="0.05"
              value={spec.spacingIn}
              onChange={num("spacingIn")}
            />
          </Field>
          <Field
            label={t("vendors.notes", "Vendor notes")}
            htmlFor="v-n"
            className="col-span-2 sm:col-span-3"
          >
            <Input
              id="v-n"
              value={spec.notes ?? ""}
              onChange={(e) => setSpec({ ...spec, notes: e.target.value || null })}
            />
          </Field>
        </div>
        {!vendor && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
            {t("vendors.makeDefault", "Use as the default vendor")}
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!name.trim() || !email.trim() || cents === null || pending}
            onClick={() =>
              vendor
                ? update.mutate({
                    id: vendor.id,
                    name: name.trim(),
                    spec: fullSpec,
                    turnaroundDays: Number(turnaround) || 0,
                  })
                : invite.mutate({
                    name: name.trim(),
                    email: email.trim(),
                    spec: fullSpec,
                    isDefault,
                    turnaroundDays: Number(turnaround) || 0,
                  })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {vendor ? t("action.save") : t("team.sendInvite", "Send invite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

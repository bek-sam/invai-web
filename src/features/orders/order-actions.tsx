import {
  type Design,
  type ITEM_FLAG_CODES,
  type OrderItem,
  type OrderWithItems,
  PRE_SHIPPED_STATES,
  type Shipment,
} from "@invai/contracts";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Money,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  Circle,
  ExternalLink,
  FileText,
  Flag,
  ImageUp,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Tag,
  X,
  Zap,
} from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShipmentStatusBadge } from "../../components/badges";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Field, NativeSelect, Section } from "../../components/page";
import { DesignPicker } from "../../components/pickers";
import { ErrorState, SkeletonRows } from "../../components/states";
import { errorInfo, errorMessage } from "../../lib/errors";
import { formatDateTime, formatInches } from "../../lib/format";
import { useCan } from "../../lib/me";
import { client, orpc } from "../../lib/rpc";
import { openInNewTab, uploadFile } from "../../lib/upload";
import { useInvalidateOrders } from "./dialogs";

type FlagCode = (typeof ITEM_FLAG_CODES)[number];

/** Shipment states that carry a label (the API shows an in-flight void as `labeled`). */
export const LIVE_LABEL_STATES: Shipment["status"][] = [
  "labeled",
  "in_transit",
  "delivered",
  "exception",
  "returned",
];

const PRE_SHIPPED = new Set<string>(PRE_SHIPPED_STATES);
const isOpenItem = (i: OrderItem) => PRE_SHIPPED.has(i.state) || i.state === "on_hold";

/** Translated flag label; the code decides the words, not the server's English message. */
export function useFlagLabel() {
  const { t } = useTranslation();
  const labels: Record<FlagCode, string> = {
    needs_mapping: t("flag.needs_mapping", "Needs mapping"),
    personalization_missing: t("flag.personalization_missing", "Personalization missing"),
    artwork_overflow: t("flag.artwork_overflow", "Artwork runs past the print area"),
    artwork_typo: t("flag.artwork_typo", "Possible typo in the personalization"),
    artwork_suspicious_chars: t("flag.artwork_suspicious_chars", "Odd characters in the text"),
    artwork_low_dpi: t("flag.artwork_low_dpi", "Artwork resolution is low"),
    artwork_qa_failed: t("flag.artwork_qa_failed", "Artwork check failed"),
    blank_oversold: t("flag.blank_oversold", "Blank out of stock"),
    address_invalid: t("flag.address_invalid", "Address needs a fix"),
    reprint: t("flag.reprint", "Reprint"),
    manual_review: t("flag.manual_review", "Needs a look"),
  };
  return (code: FlagCode) => labels[code] ?? code;
}

/* ------------------------------------ tags ------------------------------------ */

export function OrderTags({ order }: { order: OrderWithItems }) {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateOrders();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const save = useMutation(
    orpc.orders.setTags.mutationOptions({
      onSuccess: () => void invalidate(),
      onError: (err) => toast.error(errorMessage(err)),
    }),
  );
  const editable = can("orders.manage");
  const setTags = (tags: string[], undo?: string[]) =>
    save.mutate(
      { id: order.id, tags },
      {
        onSuccess: () => {
          if (undo)
            toast.success(t("orders.tagRemoved", "Tag removed"), {
              action: {
                label: t("orders.undo", "Undo"),
                onClick: () => save.mutate({ id: order.id, tags: undo }),
              },
            });
        },
      },
    );
  const add = () => {
    const tag = text.trim().slice(0, 40);
    if (!tag) return;
    if (!order.tags.includes(tag)) setTags([...order.tags, tag]);
    setText("");
    setOpen(false);
  };
  if (!editable && order.tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="size-3.5 text-muted-foreground" aria-hidden />
      {order.tags.map((tag) => (
        <Badge key={tag} variant="outline" className="gap-1 pr-1">
          {tag}
          {editable && (
            <button
              type="button"
              className="grid size-5 place-items-center rounded-sm hover:bg-muted"
              aria-label={t("orders.removeTag", "Remove tag {{tag}}", { tag })}
              disabled={save.isPending}
              onClick={() =>
                setTags(
                  order.tags.filter((x) => x !== tag),
                  order.tags,
                )
              }
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      ))}
      {editable && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <Plus />
              {t("orders.addTag", "Add tag")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <Input
                autoFocus
                value={text}
                maxLength={40}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("orders.tagPlaceholder", "e.g. gift, wholesale")}
                aria-label={t("orders.newTag", "New tag")}
              />
              <Button type="submit" size="sm" disabled={!text.trim() || save.isPending}>
                {t("orders.add", "Add")}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------ unit actions ------------------------------------ */

export function ItemFlags({ item }: { item: OrderItem }) {
  const { t } = useTranslation();
  const can = useCan();
  const flagLabel = useFlagLabel();
  const invalidate = useInvalidateOrders();
  const clear = useMutation(
    orpc.orderItems.setFlag.mutationOptions({
      onSuccess: () => void invalidate(),
      onError: (err) => toast.error(errorMessage(err)),
    }),
  );
  const active = item.flags.filter((f) => f.active);
  if (active.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {active.map((f) => (
        <li
          key={f.code}
          className={cn(
            "flex items-center gap-1 text-xs",
            f.severity === "error" ? "text-danger" : "text-warning",
          )}
        >
          <Flag className="size-3 shrink-0" aria-hidden />
          <span title={f.message}>{flagLabel(f.code)}</span>
          {can("orders.map") && (
            <button
              type="button"
              className="ml-1 grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-muted"
              aria-label={t("orders.clearFlag", "Clear flag: {{flag}}", {
                flag: flagLabel(f.code),
              })}
              disabled={clear.isPending}
              onClick={() => clear.mutate({ id: item.id, code: f.code, active: false, note: null })}
            >
              <X className="size-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Rush, flag and artwork controls for one unit. */
export function ItemActions({ item }: { item: OrderItem }) {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateOrders();
  const [flagOpen, setFlagOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const rush = useMutation(
    orpc.orderItems.setRush.mutationOptions({
      onError: (err) => toast.error(errorMessage(err)),
    }),
  );
  const toggleRush = (isRush: boolean, undoable = true) =>
    rush.mutate(
      { id: item.id, isRush },
      {
        onSuccess: () => {
          void invalidate();
          if (undoable)
            toast.success(
              isRush ? t("orders.rushOn", "Marked rush") : t("orders.rushOff", "Rush removed"),
              {
                action: {
                  label: t("orders.undo", "Undo"),
                  onClick: () => toggleRush(!isRush, false),
                },
              },
            );
        },
      },
    );
  const open = isOpenItem(item);
  const canArtwork =
    can("orders.map") && item.state === "needs_artwork" && item.personalization.length === 0;
  if (!open) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {can("orders.manage") && (
        <Button
          size="sm"
          variant={item.isRush ? "secondary" : "outline"}
          aria-pressed={item.isRush}
          disabled={rush.isPending}
          onClick={() => toggleRush(!item.isRush)}
        >
          {rush.isPending ? <Loader2 className="animate-spin" /> : <Zap />}
          {item.isRush ? t("orders.removeRush", "Remove rush") : t("orders.markRush", "Rush")}
        </Button>
      )}
      {can("orders.map") && (
        <Button size="sm" variant="outline" onClick={() => setFlagOpen(true)}>
          <Flag />
          {t("orders.addFlag", "Flag")}
        </Button>
      )}
      {canArtwork && (
        <Button size="sm" onClick={() => setArtOpen(true)}>
          <ImageUp />
          {t("orders.setArtwork", "Set artwork")}
        </Button>
      )}
      {flagOpen && <FlagDialog item={item} open={flagOpen} onOpenChange={setFlagOpen} />}
      {artOpen && <ArtworkDialog item={item} open={artOpen} onOpenChange={setArtOpen} />}
    </div>
  );
}

function FlagDialog({
  item,
  open,
  onOpenChange,
}: {
  item: OrderItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const flagLabel = useFlagLabel();
  const invalidate = useInvalidateOrders();
  // Flags the system sets on its own (mapping, stock, address) are cleared by fixing the cause.
  const choices: FlagCode[] = [
    "manual_review",
    "artwork_typo",
    "artwork_low_dpi",
    "artwork_qa_failed",
    "artwork_overflow",
    "personalization_missing",
    "reprint",
  ];
  const [code, setCode] = useState<FlagCode>("manual_review");
  const [note, setNote] = useState("");
  const set = useMutation(
    orpc.orderItems.setFlag.mutationOptions({
      onSuccess: () => {
        toast.success(t("orders.flagged", "Flag added"));
        void invalidate();
        onOpenChange(false);
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("orders.flagTitle", "Flag this unit")}</DialogTitle>
          <DialogDescription>
            {t("orders.flagHint", "Flags show on the order and in production until cleared.")}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("orders.flagWhat", "What's wrong")} htmlFor="flag-code">
          <NativeSelect
            id="flag-code"
            value={code}
            onChange={(e) => setCode(e.target.value as FlagCode)}
          >
            {choices.map((c) => (
              <option key={c} value={c}>
                {flagLabel(c)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("orders.note", "Note")} htmlFor="flag-note">
          <Textarea
            id="flag-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {set.isError && <p className="text-sm text-danger">{errorMessage(set.error)}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={set.isPending}
            onClick={() =>
              set.mutate({ id: item.id, code, active: true, note: note.trim() || null })
            }
          >
            {set.isPending && <Loader2 className="animate-spin" />}
            {t("orders.addFlag", "Flag")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Artwork for a non-personalized unit: a placement of an existing design, or an uploaded file. */
function ArtworkDialog({
  item,
  open,
  onOpenChange,
}: {
  item: OrderItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateOrders();
  const [mode, setMode] = useState<"design" | "upload">("design");
  const [design, setDesign] = useState<Design | null>(null);
  const [placementIdx, setPlacementIdx] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (mode === "design") {
        const p = design?.placements[placementIdx];
        if (!p) throw new Error(t("orders.pickDesign", "Choose a design first."));
        return client.orderItems.setArtwork({
          id: item.id,
          fileKey: p.fileKey,
          widthIn: p.widthIn,
          heightIn: p.heightIn,
        });
      }
      if (!file) throw new Error(t("orders.pickFile", "Choose a file first."));
      const fileKey = await uploadFile("artwork", file, setProgress);
      return client.orderItems.setArtwork({ id: item.id, fileKey });
    },
    onSuccess: (res) => {
      const warned = res.flags.some((f) => f.active);
      toast.success(t("orders.artworkSet", "Artwork set"), {
        description: warned
          ? t("orders.artworkWarn", "The file check found something. See the flags on the unit.")
          : undefined,
      });
      void invalidate();
      onOpenChange(false);
    },
    onSettled: () => setProgress(null),
  });
  const placements = design?.placements ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("orders.artworkTitle", "Set artwork for this unit")}</DialogTitle>
          <DialogDescription>
            {item.title}
            {item.variantTitle ? ` · ${item.variantTitle}` : ""}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList>
            <TabsTrigger value="design">{t("orders.fromDesign", "From a design")}</TabsTrigger>
            <TabsTrigger value="upload">{t("orders.uploadFile", "Upload a file")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "design" ? (
          <>
            <Field label={t("orders.design", "Design")}>
              <DesignPicker
                value={design}
                onChange={(d) => {
                  setDesign(d);
                  setPlacementIdx(0);
                }}
              />
            </Field>
            {placements.length > 1 && (
              <Field label={t("orders.placement", "Placement")} htmlFor="art-placement">
                <NativeSelect
                  id="art-placement"
                  value={placementIdx}
                  onChange={(e) => setPlacementIdx(Number(e.target.value))}
                >
                  {placements.map((p, i) => (
                    <option key={`${p.placement}-${p.fileKey}`} value={i}>
                      {t(`placement.${p.placement}`, p.placement)} · {formatInches(p.widthIn)} ×{" "}
                      {formatInches(p.heightIn)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </>
        ) : (
          <Field
            label={t("orders.artworkFile", "Print file")}
            htmlFor="art-file"
            hint={t("orders.artworkFileHint", "PNG with a transparent background, at print size.")}
          >
            <Input
              id="art-file"
              type="file"
              accept="image/png,image/svg+xml,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        )}
        {progress !== null && (
          <p className="text-xs text-muted-foreground">
            {t("orders.uploading", "Uploading… {{pct}}%", { pct: Math.round(progress * 100) })}
          </p>
        )}
        {save.isError && <p className="text-sm text-danger">{errorMessage(save.error)}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={save.isPending || (mode === "design" ? !design : !file)}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("orders.useArtwork", "Use this artwork")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------ shipment ------------------------------------ */

export function useOrderShipments(orderId: string) {
  const can = useCan();
  return useQuery(
    orpc.shipping.shipments.list.queryOptions({
      input: { orderId, limit: 20 },
      enabled: can("shipping.read"),
    }),
  );
}

export function ShipmentSection({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const can = useCan();
  const q = useOrderShipments(orderId);
  if (!can("shipping.read")) return null;
  const list = q.data?.items ?? [];
  // Live labels first, then the newest.
  const sorted = [...list].sort(
    (a, b) =>
      Number(LIVE_LABEL_STATES.includes(b.status)) - Number(LIVE_LABEL_STATES.includes(a.status)) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <Section title={t("orders.shipment", "Shipment")}>
      {q.isPending ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("orders.noShipment", "No label yet. Labels are bought once every unit is packed.")}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {sorted.map((s) => (
            <ShipmentCard key={s.id} shipment={s} />
          ))}
        </div>
      )}
    </Section>
  );
}

function ShipmentCard({ shipment: s }: { shipment: Shipment }) {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOrders();
  const [confirm, setConfirm] = useState(false);
  const pdf = useMutation({
    mutationFn: () => client.shipping.batchLabelPdf({ shipmentIds: [s.id], order: "bin" }),
    onSuccess: (res) => openInNewTab(res.url),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const voidLabel = useMutation(
    orpc.shipping.void.mutationOptions({
      onSuccess: () => {
        toast.success(t("orders.voidedToast", "Label voided"), {
          description: t(
            "orders.voidedHint",
            "The carrier refunds the postage. Some take a few days to confirm.",
          ),
        });
        setConfirm(false);
        void queryClient.invalidateQueries({ queryKey: orpc.shipping.key() });
        void invalidate();
      },
    }),
  );
  const voidError = voidLabel.isError ? errorInfo(voidLabel.error) : null;
  const pushed = s.trackingPush.status === "pushed";
  const canVoid = can("shipping.buy") && s.status === "labeled" && !pushed;
  const steps: { key: string; label: string; at: string | null; done: boolean }[] = [
    {
      key: "labeled",
      label: t("orders.stepLabeled", "Label bought"),
      at: s.labeledAt,
      done: !!s.labeledAt,
    },
    {
      key: "pushed",
      label:
        s.trackingPush.status === "not_required"
          ? t("orders.stepManual", "Tracking: add it on the channel")
          : t("orders.stepPushed", "Tracking sent to the channel"),
      at: s.trackingPush.pushedAt,
      done: pushed,
    },
    {
      key: "transit",
      label: t("orders.stepTransit", "With the carrier"),
      at: null,
      done: ["in_transit", "delivered", "exception", "returned"].includes(s.status),
    },
    {
      key: "delivered",
      label: t("orders.stepDelivered", "Delivered"),
      at: s.deliveredAt,
      done: s.status === "delivered",
    },
  ];
  const trackingText = s.trackingCode ?? "—";
  return (
    <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <ShipmentStatusBadge status={s.status} />
        <span className="text-sm font-medium">
          {s.carrier
            ? `${s.carrier.toUpperCase()} ${s.service ?? ""}`
            : t("orders.noCarrier", "Not bought yet")}
        </span>
        {(s.postage > 0 || s.labelFee > 0) && (
          <span className="ml-auto text-sm">
            <Money cents={s.postage + s.labelFee} />
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("orders.tracking", "Tracking")}</dt>
        <dd className="min-w-0 break-all font-mono text-xs leading-5">
          {s.trackingUrl && s.trackingCode ? (
            <a
              href={s.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {trackingText}
              <ExternalLink className="size-3" aria-hidden />
              <span className="sr-only">{t("orders.opensNewTab", "(opens in a new tab)")}</span>
            </a>
          ) : (
            trackingText
          )}
        </dd>
        {(s.postage > 0 || s.labelFee > 0) && (
          <>
            <dt className="text-muted-foreground">{t("orders.labelCost", "Cost")}</dt>
            <dd>
              <Money cents={s.postage} /> {t("orders.postage", "postage")} +{" "}
              <Money cents={s.labelFee} /> {t("orders.labelFee", "label fee")}
            </dd>
          </>
        )}
      </dl>
      {s.status === "voided" ? (
        <p className="text-sm text-muted-foreground">
          {t("orders.voidedAt", "Voided {{when}}", { when: formatDateTime(s.voidedAt) })}
        </p>
      ) : (
        <ol
          className="flex flex-col gap-1.5"
          aria-label={t("orders.shipmentSteps", "Shipment progress")}
        >
          {steps.map((st) => (
            <li key={st.key} className="flex items-center gap-2 text-sm">
              {st.done ? (
                <Check className="size-4 text-success" aria-hidden />
              ) : (
                <Circle className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span className={cn(!st.done && "text-muted-foreground")}>
                {st.label}
                <span className="sr-only">
                  {st.done ? t("orders.stepDone", "(done)") : t("orders.stepTodo", "(not yet)")}
                </span>
              </span>
              {st.at && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(st.at)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {s.labelKey && s.status !== "voided" && (
          <Button size="sm" variant="outline" onClick={() => pdf.mutate()} disabled={pdf.isPending}>
            {pdf.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
            {t("orders.labelPdf", "Label PDF")}
          </Button>
        )}
        {canVoid && (
          <Button
            size="sm"
            variant="outline"
            className="text-danger"
            onClick={() => {
              voidLabel.reset();
              setConfirm(true);
            }}
          >
            <Ban />
            {t("orders.voidLabel", "Void label")}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        pending={voidLabel.isPending}
        title={t("orders.voidTitle", "Void this label?")}
        description={t(
          "orders.voidBody",
          "The label stops working and the postage is refunded to your carrier account. Some carriers take a few days to confirm the refund. Don't ship the package with this label.",
        )}
        confirmLabel={t("orders.voidConfirm", "Void label")}
        onConfirm={() => voidLabel.mutate({ id: s.id })}
      >
        {voidError && (
          <p role="alert" className="text-sm text-danger">
            {voidError.code === "VOID_REJECTED"
              ? t(
                  "orders.voidRejected",
                  "The carrier won't void this label. It may already be scanned. Contact the carrier to ask for a refund.",
                )
              : voidError.code === "CONFLICT"
                ? t(
                    "orders.voidBusy",
                    "This label is changing right now (a void or a tracking update is in progress). Try again in a minute.",
                  )
                : voidError.message}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

/* ------------------------------------ address ------------------------------------ */

type AddressForm = {
  name: string;
  company: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
};

type AddressErrors = Partial<Record<"street1" | "city" | "zip", string>>;

/** The same format-only test the server runs: a street, a city and a US ZIP (or ZIP+4). */
export function addressFormatErrors(a: Pick<AddressForm, "street1" | "city" | "zip">) {
  const out: ("street1" | "city" | "zip")[] = [];
  if (!a.street1.trim()) out.push("street1");
  if (!a.city.trim()) out.push("city");
  if (!/^\d{5}(-\d{4})?$/.test(a.zip.trim())) out.push("zip");
  return out;
}

/**
 * Ship-to address with an edit form while no label exists. On an `address_check` hold the form
 * is open by default, and saving a good address releases the hold.
 */
export function AddressSection({ order }: { order: OrderWithItems }) {
  const { t } = useTranslation();
  const can = useCan();
  const shipments = useOrderShipments(order.id);
  const addressHold = order.hold?.reason === "address_check";
  const [editing, setEditing] = useState(addressHold);
  if (!can("orders.manage")) return null;
  const finished =
    order.status === "shipped" || order.status === "delivered" || order.status === "cancelled";
  const hasLabel = (shipments.data?.items ?? []).some((s) => LIVE_LABEL_STATES.includes(s.status));
  const a = order.shipTo;
  return (
    <Section
      title={t("orders.shipToAddress", "Ship-to address")}
      className={cn(addressHold && "border-warning")}
      actions={
        !finished &&
        !editing &&
        !hasLabel && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil />
            {t("orders.editAddress", "Edit address")}
          </Button>
        )
      }
    >
      {addressHold && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {hasLabel
            ? t(
                "orders.addressHoldLabeled",
                "This order is held for an address check, but it already has a label. Void the label first, then fix the address.",
              )
            : t(
                "orders.addressHoldHint",
                "This order is held for an address check. Fix the address and save: the hold is released when the street, city and ZIP look right.",
              )}
        </p>
      )}
      {editing && !finished && !hasLabel ? (
        shipments.isPending && can("shipping.read") ? (
          <Skeleton className="h-40" />
        ) : (
          <AddressEditForm order={order} onDone={() => setEditing(false)} />
        )
      ) : a ? (
        <address className="text-sm not-italic leading-6">
          {a.name}
          {a.company && <br />}
          {a.company}
          <br />
          {a.street1 || <span className="text-danger">{t("orders.noStreet", "No street")}</span>}
          {a.street2 && (
            <>
              <br />
              {a.street2}
            </>
          )}
          <br />
          {a.city}, {a.state} {a.zip} {a.country !== "US" ? a.country : ""}
          {a.phone && (
            <>
              <br />
              <span className="text-muted-foreground">{a.phone}</span>
            </>
          )}
        </address>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("orders.noAddress", "No address on this order.")}
        </p>
      )}
    </Section>
  );
}

function AddressEditForm({ order, onDone }: { order: OrderWithItems; onDone: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateOrders();
  const queryClient = useQueryClient();
  const s = order.shipTo;
  const [form, setForm] = useState<AddressForm>({
    name: s?.name ?? order.buyerName,
    company: s?.company ?? "",
    street1: s?.street1 ?? "",
    street2: s?.street2 ?? "",
    city: s?.city ?? "",
    state: s?.state ?? "",
    zip: s?.zip ?? "",
    country: s?.country ?? "US",
    phone: s?.phone ?? "",
  });
  const [touched, setTouched] = useState(false);
  const addressHold = order.hold?.reason === "address_check";
  const save = useMutation(
    orpc.orders.updateAddress.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          addressHold && !res.hold
            ? t("orders.addressSavedReleased", "Address saved. Order #{{no}} is released.", {
                no: order.orderNo.replace(/^#+/, ""),
              })
            : t("orders.addressSaved", "Address saved"),
        );
        void invalidate();
        void queryClient.invalidateQueries({ queryKey: orpc.shipping.key() });
        onDone();
      },
    }),
  );
  const bad = addressFormatErrors(form);
  const errors: AddressErrors = touched
    ? {
        street1: bad.includes("street1")
          ? t("orders.errStreet", "Enter the street address.")
          : undefined,
        city: bad.includes("city") ? t("orders.errCity", "Enter the city.") : undefined,
        zip: bad.includes("zip")
          ? t("orders.errZip", "Use a 5-digit ZIP, like 85004 or 85004-1234.")
          : undefined,
      }
    : {};
  const serverError = save.isError ? errorInfo(save.error) : null;
  const set = (k: keyof AddressForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = (
    k: keyof AddressForm,
    label: string,
    opts: { autoComplete?: string; className?: string; inputMode?: "numeric" } = {},
  ) => {
    const err = errors[k as keyof AddressErrors];
    return (
      <Field label={label} htmlFor={`addr-${k}`} error={err} className={opts.className}>
        <Input
          id={`addr-${k}`}
          value={form[k]}
          onChange={set(k)}
          autoComplete={opts.autoComplete}
          inputMode={opts.inputMode}
          aria-invalid={!!err}
        />
      </Field>
    );
  };
  return (
    <form
      className="grid gap-3 sm:grid-cols-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (bad.length) return;
        save.mutate({
          id: order.id,
          address: {
            name: form.name.trim(),
            company: form.company.trim() || null,
            street1: form.street1.trim(),
            street2: form.street2.trim() || null,
            city: form.city.trim(),
            state: form.state.trim(),
            zip: form.zip.trim(),
            country: (form.country.trim() || "US").toUpperCase().slice(0, 2),
            phone: form.phone.trim() || null,
            email: null,
          },
        });
      }}
    >
      {field("name", t("orders.addrName", "Name"), {
        autoComplete: "shipping name",
        className: "sm:col-span-3",
      })}
      {field("company", t("orders.addrCompany", "Company (optional)"), {
        autoComplete: "shipping organization",
        className: "sm:col-span-3",
      })}
      {field("street1", t("orders.addrStreet1", "Street address"), {
        autoComplete: "shipping address-line1",
        className: "sm:col-span-6",
      })}
      {field("street2", t("orders.addrStreet2", "Apt, suite, unit (optional)"), {
        autoComplete: "shipping address-line2",
        className: "sm:col-span-6",
      })}
      {field("city", t("orders.addrCity", "City"), {
        autoComplete: "shipping address-level2",
        className: "sm:col-span-3",
      })}
      {field("state", t("orders.addrState", "State"), {
        autoComplete: "shipping address-level1",
        className: "sm:col-span-1",
      })}
      {field("zip", t("orders.addrZip", "ZIP"), {
        autoComplete: "shipping postal-code",
        inputMode: "numeric",
        className: "sm:col-span-2",
      })}
      {field("phone", t("orders.addrPhone", "Phone (optional)"), {
        autoComplete: "shipping tel",
        className: "sm:col-span-3",
      })}
      <p className="text-xs text-muted-foreground sm:col-span-6">
        {t(
          "orders.addressCheckNote",
          "We check that the street, city and ZIP are filled in and look right. The carrier checks the address when you buy the label.",
        )}
      </p>
      {serverError && (
        <p role="alert" className="text-sm text-danger sm:col-span-6">
          {serverError.code === "ADDRESS_LOCKED"
            ? t(
                "orders.addressLocked",
                "This order already has a shipping label. Void the label first, then fix the address.",
              )
            : serverError.code === "ADDRESS_INVALID"
              ? t("orders.addressInvalid", "Check the street, city and ZIP, then save again.")
              : serverError.message}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-6">
        <Button type="button" variant="outline" onClick={onDone}>
          {t("action.cancel")}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {addressHold
            ? t("orders.saveAndRelease", "Save and release")
            : t("orders.saveAddress", "Save address")}
        </Button>
      </div>
    </form>
  );
}

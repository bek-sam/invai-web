import type { GangSheetDetail } from "@invai/contracts";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Money,
  Skeleton,
  Textarea,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Download,
  FileDown,
  Loader2,
  PackageCheck,
  Printer,
  RefreshCw,
  Send,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SheetStatusBadge } from "../../../components/badges";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { DefList, Field, NativeSelect, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { PlacementList } from "../../../features/production/placement-list";
import { SheetPreview } from "../../../features/production/sheet-preview";
import { formatDateTime, formatInches, formatPct } from "../../../lib/format";
import { useCan, useMe } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";
import { openInNewTab } from "../../../lib/upload";

export const Route = createFileRoute("/_app/production/sheets/$sheetId")({
  component: SheetPage,
});

function SheetPage() {
  const { t } = useTranslation();
  const { sheetId } = Route.useParams();
  const q = useQuery(orpc.production.sheets.get.queryOptions({ input: { id: sheetId } }));
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/production/sheets">
          <ArrowLeft />
          {t("nav.gangSheets")}
        </Link>
      </Button>
      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[60vh]" />
          <SkeletonRows rows={10} />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <SheetView sheet={q.data} />
      )}
    </div>
  );
}

function SheetView({ sheet }: { sheet: GangSheetDetail }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{sheet.name}</h1>
          <SheetStatusBadge status={sheet.status} />
          {sheet.reprintCount > 0 && (
            <Badge variant="warning">
              {t("sheets.reprints", "{{count}} reprints", { count: sheet.reprintCount })}
            </Badge>
          )}
        </div>
        <SheetActions sheet={sheet} />
      </div>
      {sheet.error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{sheet.error}</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <SheetPreview
          sheetId={sheet.id}
          widthIn={sheet.widthIn}
          lengthIn={sheet.lengthIn}
          placements={sheet.placements}
          highlight={hovered}
          source="shop"
        />
        <div className="flex flex-col gap-4">
          <Section title={t("sheets.details", "Details")}>
            <DefList
              items={[
                [
                  t("sheets.size", "Size"),
                  `${formatInches(sheet.widthIn)} × ${formatInches(sheet.lengthIn)}`,
                ],
                [t("sheets.utilization", "Film use"), formatPct(sheet.utilization)],
                [t("sheets.transfers", "Transfers"), sheet.transferCount],
                [t("sheets.cost", "Cost"), <Money key="c" cents={sheet.cost} />],
                [t("sheets.vendor", "Vendor"), sheet.vendorName ?? "—"],
                [t("sheets.sent", "Sent"), formatDateTime(sheet.sentAt)],
                [t("sheets.printed", "Printed"), formatDateTime(sheet.printedAt)],
                [
                  t("sheets.tracking", "Tracking"),
                  sheet.tracking ? `${sheet.tracking.carrier} ${sheet.tracking.code}` : "—",
                ],
                [t("sheets.received", "Received"), formatDateTime(sheet.receivedAt)],
              ]}
            />
          </Section>
          <PlacementList placements={sheet.placements} onHover={setHovered} />
        </div>
      </div>
    </div>
  );
}

function SheetActions({ sheet }: { sheet: GangSheetDetail }) {
  const { t } = useTranslation();
  const can = useCan();
  const me = useMe();
  const queryClient = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.production.sheets.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.today.key() });
  };
  const downloads = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery(
        orpc.production.sheets.downloadUrls.queryOptions({ input: { id: sheet.id }, staleTime: 0 }),
      ),
  });
  const received = useMutation(
    orpc.production.sheets.markReceived.mutationOptions({
      onSuccess: () => {
        toast.success(t("sheets.receivedToast", "Transfers received; items are ready to press"));
        invalidate();
      },
    }),
  );
  const regenerate = useMutation(
    orpc.production.sheets.regenerate.mutationOptions({
      onSuccess: () => {
        toast.success(t("sheets.regenerating", "Regenerating the sheet"));
        invalidate();
      },
    }),
  );
  const cancel = useMutation(
    orpc.production.sheets.cancel.mutationOptions({
      onSuccess: () => {
        toast.success(t("sheets.cancelledToast", "Sheet cancelled"));
        setCancelOpen(false);
        invalidate();
      },
    }),
  );
  const markPrinting = useMutation(
    orpc.production.sheets.markPrinting.mutationOptions({
      onSuccess: () => {
        toast.success(t("sheets.printingToast", "Printing in-house"));
        invalidate();
      },
    }),
  );
  const markPrinted = useMutation(
    orpc.production.sheets.markPrinted.mutationOptions({
      onSuccess: () => {
        toast.success(t("sheets.printedToast", "Marked printed"));
        invalidate();
      },
    }),
  );
  const download = async (kind: "png" | "pdf") => {
    const urls = await downloads.mutateAsync();
    const url = urls[kind];
    if (url) openInNewTab(url);
    else toast.error(t("sheets.noFile", "That file isn't ready yet"));
  };
  const s = sheet.status;
  const manage = can("production.build");
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download("png")}
        disabled={!sheet.files.pngKey || downloads.isPending}
      >
        <Download />
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download("pdf")}
        disabled={!sheet.files.pdfKey || downloads.isPending}
      >
        <FileDown />
        PDF
      </Button>
      {manage && s === "ready" && !me.org.printsInHouse && (
        <Button size="sm" onClick={() => setSendOpen(true)}>
          <Send />
          {t("sheets.send", "Send to vendor")}
        </Button>
      )}
      {manage && s === "ready" && me.org.printsInHouse && (
        <Button
          size="sm"
          onClick={() => markPrinting.mutate({ id: sheet.id })}
          disabled={markPrinting.isPending}
        >
          {markPrinting.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
          {t("sheets.markPrinting", "Print in-house")}
        </Button>
      )}
      {manage && s === "printing" && (
        <Button
          size="sm"
          variant="success"
          onClick={() => markPrinted.mutate({ id: sheet.id })}
          disabled={markPrinted.isPending}
        >
          {markPrinted.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
          {t("sheets.markPrinted", "Mark printed")}
        </Button>
      )}
      {manage && ["sent", "acknowledged", "printed", "shipped"].includes(s) && (
        <Button
          size="sm"
          variant="success"
          onClick={() => received.mutate({ id: sheet.id })}
          disabled={received.isPending}
        >
          {received.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
          {t("sheets.markReceived", "Mark received")}
        </Button>
      )}
      {manage && (s === "ready" || s === "failed") && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => regenerate.mutate({ id: sheet.id })}
          disabled={regenerate.isPending}
        >
          <RefreshCw />
          {t("sheets.regenerate", "Regenerate")}
        </Button>
      )}
      {manage &&
        ["building", "ready", "printing", "failed", "sent", "acknowledged"].includes(s) && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={() => setCancelOpen(true)}
          >
            <Ban />
            {t("action.cancel")}
          </Button>
        )}
      {sendOpen && (
        <SendDialog sheet={sheet} open={sendOpen} onOpenChange={setSendOpen} onSent={invalidate} />
      )}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("sheets.cancelTitle", "Cancel {{name}}?", { name: sheet.name })}
        description={t(
          "sheets.cancelHint",
          "Items on this sheet go back to ready and can be rebuilt.",
        )}
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate({ id: sheet.id })}
      />
    </div>
  );
}

function SendDialog({
  sheet,
  open,
  onOpenChange,
  onSent,
}: {
  sheet: GangSheetDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const vendors = useQuery(orpc.vendors.list.queryOptions({ input: {} }));
  const [vendorId, setVendorId] = useState(sheet.vendorConnectionId ?? "");
  const [note, setNote] = useState("");
  const send = useMutation(
    orpc.production.sheets.sendToVendor.mutationOptions({
      onSuccess: (s) => {
        toast.success(
          t("sheets.sentToast", "Sent to {{vendor}}", {
            vendor: s.vendorName ?? t("sheets.vendorLower", "vendor"),
          }),
        );
        onSent();
        onOpenChange(false);
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sheets.send", "Send to vendor")}</DialogTitle>
          <DialogDescription>
            {t("sheets.sendHint", "The vendor gets the print file in their portal or by email.")}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("sheets.vendor", "Vendor")} htmlFor="send-vendor">
          <NativeSelect
            id="send-vendor"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">{t("sheets.defaultVendor", "Default vendor")}</option>
            {vendors.data?.items
              .filter((v) => v.status !== "paused")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.delivery}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label={t("orders.note", "Note")} htmlFor="send-note">
          <Textarea
            id="send-note"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() =>
              send.mutate({
                id: sheet.id,
                vendorConnectionId: vendorId || undefined,
                note: note.trim() || undefined,
              })
            }
            disabled={send.isPending}
          >
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t("sheets.send", "Send to vendor")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

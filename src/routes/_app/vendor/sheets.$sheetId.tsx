import type { VendorInboxSheet } from "@invai/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Money,
  Skeleton,
  Textarea,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Download,
  FileDown,
  Loader2,
  Printer,
  Truck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SheetStatusBadge } from "../../../components/badges";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { DefList, Field, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { PlacementList } from "../../../features/production/placement-list";
import { PrintFilesNote } from "../../../features/production/print-files-note";
import { SheetPreview } from "../../../features/production/sheet-preview";
import { formatDateTime, formatInches, formatPct } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";
import { openInNewTab } from "../../../lib/upload";

export const Route = createFileRoute("/_app/vendor/sheets/$sheetId")({
  component: VendorSheetPage,
});

function VendorSheetPage() {
  const { t } = useTranslation();
  const { sheetId } = Route.useParams();
  const q = useQuery(orpc.vendorPortal.get.queryOptions({ input: { id: sheetId } }));
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/vendor">
          <ArrowLeft />
          {t("nav.sheetInbox")}
        </Link>
      </Button>
      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[60vh]" />
          <SkeletonRows rows={8} />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{q.data.name}</h1>
              <SheetStatusBadge status={q.data.status} />
              <span className="text-muted-foreground">{q.data.shop.name}</span>
            </div>
            <VendorActions sheet={q.data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <SheetPreview
              sheetId={q.data.id}
              widthIn={q.data.widthIn}
              lengthIn={q.data.lengthIn}
              placements={q.data.placements}
              highlight={hovered}
              source="vendor"
            />
            <div className="flex flex-col gap-4">
              <Section title={t("sheets.details", "Details")}>
                <DefList
                  items={[
                    [
                      t("sheets.size", "Size"),
                      `${formatInches(q.data.widthIn)} × ${formatInches(q.data.lengthIn)}`,
                    ],
                    [t("sheets.utilization", "Film use"), formatPct(q.data.utilization)],
                    [t("sheets.transfers", "Transfers"), q.data.transferCount],
                    [t("vendor.amount", "Amount"), <Money key="c" cents={q.data.cost} />],
                    [
                      t("vendors.format", "Format"),
                      `${q.data.spec.format.toUpperCase()} · ${q.data.spec.dpi} DPI`,
                    ],
                    [t("vendor.received", "Received"), formatDateTime(q.data.sentAt)],
                    [
                      t("sheets.tracking", "Tracking"),
                      q.data.tracking ? `${q.data.tracking.carrier} ${q.data.tracking.code}` : "—",
                    ],
                  ]}
                />
              </Section>
              <PlacementList placements={q.data.placements} onHover={setHovered} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorActions({ sheet }: { sheet: VendorInboxSheet }) {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const [shipOpen, setShipOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: orpc.vendorPortal.key() });
  const ack = useMutation(
    orpc.vendorPortal.acknowledge.mutationOptions({
      onSuccess: () => {
        toast.success(t("vendor.acked", "Acknowledged"));
        invalidate();
      },
    }),
  );
  const printed = useMutation(
    orpc.vendorPortal.markPrinted.mutationOptions({
      onSuccess: () => {
        toast.success(t("vendor.printedToast", "Marked printed"));
        invalidate();
      },
    }),
  );
  const reject = useMutation(
    orpc.vendorPortal.reject.mutationOptions({
      onSuccess: () => {
        setRejectOpen(false);
        invalidate();
      },
    }),
  );
  const downloads = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery(
        orpc.vendorPortal.downloadUrls.queryOptions({ input: { id: sheet.id }, staleTime: 0 }),
      ),
  });
  const download = async (kind: "png" | "pdf") => {
    const urls = await downloads.mutateAsync();
    if (urls[kind]) openInNewTab(urls[kind] as string);
    else toast.error(t("sheets.noFile", "That file isn't ready yet"));
  };
  const update = can("vendor_portal.update");
  const s = sheet.status;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download("png")}
        disabled={!sheet.files.pngKey}
      >
        <Download />
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download("pdf")}
        disabled={!sheet.files.pdfKey}
      >
        <FileDown />
        PDF
      </Button>
      <PrintFilesNote sheet={sheet} audience="vendor" />
      {update && s === "sent" && (
        <Button size="sm" onClick={() => ack.mutate({ id: sheet.id })} disabled={ack.isPending}>
          {ack.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {t("vendor.acknowledge", "Acknowledge")}
        </Button>
      )}
      {update && (s === "sent" || s === "acknowledged") && (
        <Button
          size="sm"
          onClick={() => printed.mutate({ id: sheet.id })}
          disabled={printed.isPending}
        >
          {printed.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
          {t("vendor.markPrinted", "Mark printed")}
        </Button>
      )}
      {update && s === "printed" && (
        <Button size="sm" onClick={() => setShipOpen(true)}>
          <Truck />
          {t("vendor.markShipped", "Mark shipped")}
        </Button>
      )}
      {update && (s === "sent" || s === "acknowledged") && (
        <Button
          size="sm"
          variant="ghost"
          className="text-danger"
          onClick={() => setRejectOpen(true)}
        >
          <XCircle />
          {t("vendor.problem", "Report a problem")}
        </Button>
      )}
      {shipOpen && (
        <ShipDialog sheetId={sheet.id} onClose={() => setShipOpen(false)} onDone={invalidate} />
      )}
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t("vendor.problemTitle", "Send this sheet back?")}
        description={t(
          "vendor.problemHint",
          "The shop sees your reason and can fix and resend the file.",
        )}
        confirmLabel={t("vendor.sendBack", "Send back")}
        destructive
        pending={reject.isPending}
        onConfirm={() => reason.trim() && reject.mutate({ id: sheet.id, reason: reason.trim() })}
      >
        <Textarea
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("vendor.reasonPh", "e.g. File is 20 inches wide, our film is 22")}
        />
      </ConfirmDialog>
    </div>
  );
}

function ShipDialog({
  sheetId,
  onClose,
  onDone,
}: {
  sheetId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [carrier, setCarrier] = useState("USPS");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const ship = useMutation(
    orpc.vendorPortal.markShipped.mutationOptions({
      onSuccess: () => {
        toast.success(t("vendor.shippedToast", "Marked shipped"));
        onDone();
        onClose();
      },
    }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("vendor.markShipped", "Mark shipped")}</DialogTitle>
        </DialogHeader>
        <Field label={t("vendor.carrier", "Carrier")} htmlFor="vs-carrier">
          <Input id="vs-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </Field>
        <Field label={t("ship.trackingCode", "Tracking")} htmlFor="vs-code">
          <Input
            id="vs-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label={t("orders.note", "Note")} htmlFor="vs-note">
          <Input
            id="vs-note"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!carrier.trim() || !code.trim() || ship.isPending}
            onClick={() =>
              ship.mutate({
                id: sheetId,
                carrier: carrier.trim(),
                trackingCode: code.trim(),
                note: note.trim() || undefined,
              })
            }
          >
            {ship.isPending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

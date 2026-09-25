import type { Bin } from "@invai/contracts";
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { RowSelectionState } from "@tanstack/react-table";
import { Archive, Loader2, Pencil, Plus, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Field, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { errorInfo } from "../../../lib/errors";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";
import { openInNewTab } from "../../../lib/upload";

export const Route = createFileRoute("/_app/production/bins")({
  component: BinsPage,
});

function BinsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can("production.build");
  const queryClient = useQueryClient();
  const [onlyOccupied, setOnlyOccupied] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<Bin | null>(null);
  const [archiving, setArchiving] = useState<Bin | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const bins = useQuery(
    orpc.production.bins.list.queryOptions({ input: { onlyOccupied, includeArchived } }),
  );
  const rows = bins.data?.items ?? [];
  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, v]) => v)
        .map(([id]) => id),
    [rowSelection],
  );

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: orpc.production.bins.key() });

  const archive = useMutation(
    orpc.production.bins.archive.mutationOptions({
      onSuccess: () => {
        toast.success(t("bins.archivedToast", "Bin archived"));
        setArchiving(null);
        invalidate();
      },
      onError: () => setArchiving(null),
    }),
  );

  const labels = useMutation(
    orpc.production.bins.labels.mutationOptions({
      onSuccess: async (res) => {
        const url = await queryClient.fetchQuery(
          orpc.files.downloadUrl.queryOptions({
            input: { fileKey: res.key, disposition: "attachment" },
            staleTime: 0,
          }),
        );
        openInNewTab(url.url);
      },
    }),
  );

  const columns: DataTableColumn<Bin>[] = [
    {
      accessorKey: "code",
      header: t("bins.code", "Code"),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      accessorKey: "name",
      header: t("bins.name", "Name"),
      cell: ({ row }) => row.original.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "status",
      header: t("bins.status", "Status"),
      cell: ({ row }) => {
        const b = row.original;
        return b.archivedAt ? (
          <Badge variant="outline">{t("bins.archived", "Archived")}</Badge>
        ) : b.orderId ? (
          <Badge variant="warning">{t("bins.occupied", "Occupied")}</Badge>
        ) : (
          <Badge variant="success">{t("bins.available", "Available")}</Badge>
        );
      },
    },
    {
      accessorKey: "orderNo",
      header: t("bins.order", "Order"),
      cell: ({ row }) =>
        row.original.orderId ? (
          <Link
            to="/orders/$orderId"
            params={{ orderId: row.original.orderId }}
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.orderNo}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "units",
      header: t("bins.units", "Units"),
      cell: ({ row }) => `${row.original.unitsInBin} / ${row.original.unitsExpected}`,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const b = row.original;
        if (!manage || b.archivedAt) return null;
        return (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t("bins.rename", "Rename")}
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(b);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t("bins.archive", "Archive")}
              disabled={!!b.orderId}
              title={b.orderId ? t("bins.occupiedHint", "Release the bin first") : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setArchiving(b);
              }}
            >
              <Archive className="size-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <Page
      title={t("nav.bins", "Bins")}
      description={t("bins.subtitle", "Totes and shelf spots for orders in production.")}
      actions={
        manage && (
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <Button
                variant="outline"
                onClick={() => labels.mutate({ binIds: selectedIds })}
                disabled={labels.isPending}
              >
                {labels.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
                {t("bins.printLabels", "Print labels ({{count}})", { count: selectedIds.length })}
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              {t("bins.create", "New bin")}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={onlyOccupied} onCheckedChange={setOnlyOccupied} />
            {t("bins.onlyOccupied", "Occupied only")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={includeArchived} onCheckedChange={setIncludeArchived} />
            {t("bins.includeArchived", "Show archived")}
          </label>
        </div>
        {bins.isError ? (
          <ErrorState error={bins.error} onRetry={() => void bins.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            isLoading={bins.isPending}
            enableRowSelection={manage}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            emptyTitle={t("bins.empty", "No bins yet")}
            emptyDescription={t("bins.emptyHint", "Create a bin for each tote or shelf spot.")}
            maxHeight="calc(100dvh - 16rem)"
          />
        )}
      </div>
      {createOpen && <CreateBinDialog open={createOpen} onOpenChange={setCreateOpen} />}
      {renaming && (
        <RenameBinDialog bin={renaming} open={!!renaming} onOpenChange={() => setRenaming(null)} />
      )}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={t("bins.archiveTitle", "Archive {{code}}?", { code: archiving?.code ?? "" })}
        description={t("bins.archiveHint", "The bin stays but drops off the active list.")}
        destructive
        pending={archive.isPending}
        onConfirm={() => archiving && archive.mutate({ id: archiving.id })}
      />
    </Page>
  );
}

function CreateBinDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const create = useMutation(
    orpc.production.bins.create.mutationOptions({
      meta: { silent: true },
      onSuccess: () => {
        toast.success(t("bins.createdToast", "Bin created"));
        void queryClient.invalidateQueries({ queryKey: orpc.production.bins.key() });
        onOpenChange(false);
      },
      onError: (err) => {
        const { code: c, message } = errorInfo(err);
        toast.error(
          c === "CODE_TAKEN" ? t("bins.codeTaken", "A bin with this code already exists") : message,
        );
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bins.create", "New bin")}</DialogTitle>
          <DialogDescription>
            {t("bins.createHint", "The code is what the floor scans; the name is just for people.")}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("bins.code", "Code")} htmlFor="bin-code">
          <Input
            id="bin-code"
            value={code}
            maxLength={40}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Field label={t("bins.nameOptional", "Name (optional)")} htmlFor="bin-name">
          <Input
            id="bin-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => create.mutate({ code: code.trim(), name: name.trim() || null })}
            disabled={!code.trim() || create.isPending}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("bins.create", "New bin")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameBinDialog({
  bin,
  open,
  onOpenChange,
}: {
  bin: Bin;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(bin.name ?? "");
  const rename = useMutation(
    orpc.production.bins.rename.mutationOptions({
      onSuccess: () => {
        toast.success(t("bins.renamedToast", "Bin renamed"));
        void queryClient.invalidateQueries({ queryKey: orpc.production.bins.key() });
        onOpenChange(false);
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bins.renameTitle", "Rename {{code}}", { code: bin.code })}</DialogTitle>
        </DialogHeader>
        <Field label={t("bins.name", "Name")} htmlFor="bin-rename">
          <Input
            id="bin-rename"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => rename.mutate({ id: bin.id, name: name.trim() })}
            disabled={!name.trim() || rename.isPending}
          >
            {rename.isPending ? <Loader2 className="animate-spin" /> : <Pencil />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { type AdSpend, CHANNELS } from "@invai/contracts";
import type { DataTableColumn } from "@invai/ui";
import { Button, ChannelBadge, DataTable, Input, Money, toast } from "@invai/ui";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { NativeSelect, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import {
  CsvImportDialog,
  ReportStats,
  RowErrors,
} from "../../../features/catalog/csv-import-dialog";
import { AdSpendDialog, adSpendCsvTemplate } from "../../../features/finance/ad-spend";
import { downloadCsv } from "../../../features/orders/export";
import { useCan } from "../../../lib/me";
import { client, orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/analytics/ad-spend")({
  validateSearch: z.object({
    channel: z.enum(CHANNELS).optional().catch(undefined),
    from: z.iso.date().optional().catch(undefined),
    to: z.iso.date().optional().catch(undefined),
  }),
  component: AdSpendPage,
});

type ImportReport = { created: number; failed: number; errors: { row: number; message: string }[] };

function AdSpendPage() {
  const { t } = useTranslation();
  const can = useCan();
  const editable = can("finance.manage");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/analytics/ad-spend" });
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdSpend | null>(null);
  const [deleting, setDeleting] = useState<AdSpend | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (p) => ({ ...p, ...patch }), replace: true });

  const list = useInfiniteQuery(
    orpc.finance.adSpend.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        cursor,
        limit: 50,
        channel: search.channel,
        from: search.from,
        to: search.to,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.finance.key() });
  };

  const create = useMutation(
    orpc.finance.adSpend.create.mutationOptions({
      onSuccess: () => {
        toast.success(t("adSpend.saved", "Saved; profit is being recomputed"));
        setCreating(false);
        invalidate();
      },
    }),
  );
  const update = useMutation(
    orpc.finance.adSpend.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("adSpend.saved", "Saved; profit is being recomputed"));
        setEditing(null);
        invalidate();
      },
    }),
  );
  const remove = useMutation(
    orpc.finance.adSpend.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t("adSpend.deleted", "Deleted; profit is being recomputed"));
        setDeleting(null);
        invalidate();
      },
    }),
  );

  const columns: DataTableColumn<AdSpend>[] = [
    { accessorKey: "date", header: t("adSpend.date", "Date") },
    {
      accessorKey: "channel",
      header: t("orders.channel", "Channel"),
      cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
    },
    {
      accessorKey: "amount",
      header: t("adSpend.amount", "Amount"),
      cell: ({ row }) => <Money cents={row.original.amount} />,
    },
    {
      accessorKey: "campaign",
      header: t("adSpend.campaign", "Campaign"),
      cell: ({ row }) => row.original.campaign ?? "—",
    },
    {
      accessorKey: "note",
      header: t("adSpend.note", "Note"),
      cell: ({ row }) => (
        <span className="line-clamp-1 text-muted-foreground">{row.original.note ?? "—"}</span>
      ),
    },
    ...(editable
      ? [
          {
            id: "row-actions",
            header: "",
            cell: ({ row }: { row: { original: AdSpend } }) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setEditing(row.original)}
                  aria-label={t("action.edit")}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setDeleting(row.original)}
                  aria-label={t("action.delete")}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          } satisfies DataTableColumn<AdSpend>,
        ]
      : []),
  ];

  return (
    <Page
      title={t("nav.adSpend", "Ad spend")}
      description={t(
        "adSpend.subtitle",
        "Ad spend by channel and date, allocated into true profit.",
      )}
      actions={
        editable && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp />
              {t("adSpend.import", "Import CSV")}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t("adSpend.add", "Add spend")}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={t("orders.channel", "Channel")}
            value={search.channel ?? ""}
            onChange={(e) => setSearch({ channel: (e.target.value || undefined) as never })}
          >
            <option value="">{t("orders.allChannels", "All channels")}</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`channel.${c}`, c)}
              </option>
            ))}
          </NativeSelect>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              className="w-[9.5rem]"
              value={search.from ?? ""}
              max={search.to}
              onChange={(e) => setSearch({ from: e.target.value || undefined })}
              aria-label={t("adSpend.from", "From")}
            />
            <span className="text-muted-foreground" aria-hidden>
              –
            </span>
            <Input
              type="date"
              className="w-[9.5rem]"
              value={search.to ?? ""}
              min={search.from}
              onChange={(e) => setSearch({ to: e.target.value || undefined })}
              aria-label={t("adSpend.to", "To")}
            />
          </div>
          <span className="ml-auto text-sm text-muted-foreground">
            {t("adSpend.total", "Total")}: <Money cents={total} className="font-medium" />
          </span>
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <DataTable
            columns={columns as DataTableColumn<AdSpend, unknown>[]}
            data={rows}
            getRowId={(r) => r.id}
            isLoading={list.isPending}
            hasMore={!!list.hasNextPage}
            onLoadMore={() => void list.fetchNextPage()}
            isLoadingMore={list.isFetchingNextPage}
            emptyTitle={t("adSpend.none", "No ad spend recorded for this filter")}
            maxHeight="calc(100dvh - 20rem)"
          />
        )}
      </div>
      <AdSpendDialog
        open={creating}
        onOpenChange={setCreating}
        editing={null}
        pending={create.isPending}
        onSubmit={(input) => create.mutate(input)}
      />
      <AdSpendDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        editing={editing}
        pending={update.isPending}
        onSubmit={(input) => editing && update.mutate({ id: editing.id, ...input })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("adSpend.deleteTitle", "Delete this entry?")}
        description={t(
          "adSpend.deleteBody",
          "This removes the spend from that day's ad allocation and queues a profit recompute.",
        )}
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate({ id: deleting.id })}
      />
      <CsvImportDialog<ImportReport>
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t("adSpend.importTitle", "Import ad spend from CSV")}
        description={t(
          "adSpend.importHint",
          "Columns: date, channel, amount, campaign (optional), note (optional).",
        )}
        extra={
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => downloadCsv("ad-spend-template.csv", adSpendCsvTemplate())}
          >
            {t("adSpend.template", "Download template")}
          </Button>
        }
        onImport={async (fileKey) => {
          const r = await client.finance.adSpend.importCsv({ fileKey });
          invalidate();
          return r;
        }}
        renderReport={(r) => (
          <div>
            <ReportStats
              stats={[
                [t("adSpend.created", "Imported"), r.created, "ok"],
                [t("adSpend.failed", "Rows failed"), r.failed, "bad"],
              ]}
            />
            <RowErrors errors={r.errors} />
          </div>
        )}
      />
    </Page>
  );
}

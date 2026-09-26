import {
  CHANNELS,
  type Channel,
  type Design,
  LISTING_DRAFT_STATES,
  type ListingDraft,
} from "@invai/contracts";
import {
  Badge,
  Button,
  ChannelBadge,
  Checkbox,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RelativeTime,
  Textarea,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Field, NativeSelect, Page } from "../../../components/page";
import { DesignPicker } from "../../../components/pickers";
import { ErrorState } from "../../../components/states";
import { DraftStatusBadge } from "../../../features/listings/badges";
import { errorMessage } from "../../../lib/errors";
import { useCan } from "../../../lib/me";
import { client, orpc } from "../../../lib/rpc";
import { openInNewTab } from "../../../lib/upload";

export const Route = createFileRoute("/_app/listings/drafts/")({
  validateSearch: z.object({
    designId: z.string().optional().catch(undefined),
    create: z.boolean().optional().catch(undefined),
  }),
  component: DraftsPage,
});

function DraftsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [createOpen, setCreateOpen] = useState(!!search.create);
  const [selected, setSelected] = useState<Record<string, true>>({});
  const q = useInfiniteQuery(
    orpc.ai.listings.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        status: status ? [status as never] : undefined,
        channel: (channel || undefined) as never,
        designId: search.designId,
        cursor,
        limit: 100,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const counts = q.data?.pages[0]?.counts;
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const selectedDrafts = rows.filter((r) => selectedIds.includes(r.id));
  const selectedChannels = new Set(selectedDrafts.map((r) => r.channel));
  const exportChannel: Channel | null =
    selectedChannels.size === 1 ? (selectedDrafts[0]?.channel as Channel) : null;
  const exportCsv = useMutation({
    mutationFn: async () => {
      if (!exportChannel) throw new Error("mixed channels");
      const { key } = await client.ai.exportCsv({ draftIds: selectedIds, channel: exportChannel });
      const { url } = await client.files.downloadUrl({ fileKey: key, disposition: "attachment" });
      return url;
    },
    onSuccess: (url) => {
      openInNewTab(url);
      setSelected({});
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const columns: DataTableColumn<ListingDraft>[] = [
    {
      accessorKey: "designName",
      header: t("orders.design", "Design"),
      cell: ({ row }) => <span className="font-medium">{row.original.designName}</span>,
    },
    {
      accessorKey: "channel",
      header: t("orders.channel", "Channel"),
      cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
    },
    {
      id: "title",
      header: t("listings.title", "Title"),
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-md">{row.original.content.title || "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: t("sheets.status", "Status"),
      cell: ({ row }) => <DraftStatusBadge status={row.original.status} />,
    },
    {
      id: "checks",
      header: t("listings.checks", "Checks"),
      cell: ({ row }) => {
        const v = row.original.validation;
        const tm = row.original.trademark;
        return (
          <span className="flex gap-1">
            {v && (
              <Badge variant={v.ok ? "success" : "danger"}>
                {v.ok
                  ? t("listings.valid", "Valid")
                  : t("listings.nErrors", "{{count}} errors", { count: v.errors.length })}
              </Badge>
            )}
            {tm && (
              <Badge
                variant={
                  tm.riskLevel === "high"
                    ? "danger"
                    : tm.riskLevel === "medium"
                      ? "warning"
                      : "secondary"
                }
              >
                TM {tm.riskScore}
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "updatedAt",
      header: t("listings.updated", "Updated"),
      cell: ({ row }) => (
        <RelativeTime value={row.original.updatedAt} className="text-muted-foreground" />
      ),
    },
  ];
  return (
    <Page
      title={t("nav.aiDrafts")}
      description={t(
        "listings.subtitle",
        "AI drafts titles, tags and descriptions per channel. A person approves every listing.",
      )}
      actions={
        can("ai.listings.manage") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Sparkles />
            {t("listings.new", "Draft listings")}
          </Button>
        )
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <NativeSelect
          aria-label={t("sheets.status", "Status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t("po.allStatuses", "All statuses")}</option>
          {LISTING_DRAFT_STATES.map((s) => (
            <option key={s} value={s}>
              {t(`draftState.${s}`, s.replace(/_/g, " "))}
              {counts ? ` (${counts[s] ?? 0})` : ""}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t("orders.channel", "Channel")}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          <option value="">{t("orders.allChannels", "All channels")}</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`channel.${c}`, c)}
            </option>
          ))}
        </NativeSelect>
        {search.designId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: "/listings/drafts", search: {} })}
          >
            {t("listings.clearDesign", "Show all designs")}
          </Button>
        )}
        {can("ai.listings.manage") && selectedIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={!exportChannel || exportCsv.isPending}
            title={exportChannel ? undefined : t("listings.exportMixedChannel", "")}
            onClick={() => exportCsv.mutate()}
          >
            {exportCsv.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {t("listings.exportSelected", "Export {{count}} as CSV", {
              count: selectedIds.length,
            })}
          </Button>
        )}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<ListingDraft, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          enableRowSelection={can("ai.listings.manage")}
          rowSelection={selected}
          onRowSelectionChange={setSelected}
          isLoading={q.isPending}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          onRowClick={(r) =>
            void navigate({ to: "/listings/drafts/$draftId", params: { draftId: r.id } })
          }
          emptyTitle={t("listings.empty", "No drafts yet")}
          emptyDescription={t(
            "listings.emptyHint",
            "Pick a design and channels to draft listings.",
          )}
          maxHeight="calc(100dvh - 15rem)"
        />
      )}
      {createOpen && (
        <CreateDialog designId={search.designId} onClose={() => setCreateOpen(false)} />
      )}
    </Page>
  );
}

function CreateDialog({ designId, onClose }: { designId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const initial = useQuery(
    orpc.designs.get.queryOptions({ input: { id: designId ?? "" }, enabled: !!designId }),
  );
  const [design, setDesign] = useState<Design | null>(null);
  const current = design ?? initial.data ?? null;
  const [channels, setChannels] = useState<Set<string>>(new Set(["etsy"]));
  const [brief, setBrief] = useState("");
  const create = useMutation(
    orpc.ai.listings.create.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          t("listings.generating", "Drafting {{count}} listings", { count: res.drafts.length }),
        );
        void queryClient.invalidateQueries({ queryKey: orpc.ai.listings.key() });
        onClose();
        const first = res.drafts[0];
        if (res.drafts.length === 1 && first)
          void navigate({ to: "/listings/drafts/$draftId", params: { draftId: first.id } });
      },
    }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("listings.new", "Draft listings")}</DialogTitle>
          <DialogDescription>
            {t(
              "listings.newHint",
              "One draft per channel, checked against each channel's limits and the trademark index.",
            )}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("orders.design", "Design")}>
          <DesignPicker value={current} onChange={setDesign} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">
            {t("listings.channels", "Channels")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.filter((c) => c !== "csv").map((c) => (
              <label
                key={c}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
              >
                <Checkbox
                  checked={channels.has(c)}
                  onCheckedChange={(v) => {
                    const n = new Set(channels);
                    if (v) n.add(c);
                    else n.delete(c);
                    setChannels(n);
                  }}
                />
                {t(`channel.${c}`, c)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          label={t("listings.brief", "Brief (optional)")}
          htmlFor="brief"
          hint={t("listings.briefHint", "e.g. funny, for dog moms, desert vibes")}
        >
          <Textarea
            id="brief"
            rows={3}
            maxLength={2000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!current || channels.size === 0 || create.isPending}
            onClick={() =>
              current &&
              create.mutate({
                designId: current.id,
                channels: [...channels] as never,
                brief: brief.trim() || undefined,
                batch: false,
              })
            }
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {t("listings.generate", "Generate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

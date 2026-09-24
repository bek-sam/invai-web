import {
  BATCH_EXCLUSION_REASONS,
  type BatchPreview,
  type GangSheet,
  type SheetState,
} from "@invai/contracts";
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  Input,
  Money,
  Progress,
  RelativeTime,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, Hammer, Layers, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { SheetStatusBadge } from "../../../components/badges";
import { Field, NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { JobProgress } from "../../../features/production/job-progress";
import { endOfDayIso, formatInches, formatPct, toDateInput } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

const TABS = ["open", "received", "all"] as const;
const OPEN: SheetState[] = [
  "building",
  "ready",
  "sent",
  "acknowledged",
  "printed",
  "shipped",
  "failed",
];

export const Route = createFileRoute("/_app/production/sheets/")({
  validateSearch: z.object({
    build: z.boolean().optional().catch(undefined),
    tab: z.enum(TABS).optional().catch(undefined),
  }),
  component: SheetsPage,
});

function SheetsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/production/sheets/" });
  const tab = search.tab ?? "open";
  const [buildOpen, setBuildOpen] = useState(!!search.build);
  const status =
    tab === "open" ? OPEN : tab === "received" ? (["received"] as SheetState[]) : undefined;
  const sheets = useInfiniteQuery(
    orpc.production.sheets.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ status, cursor, limit: 100 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => sheets.data?.pages.flatMap((p) => p.items) ?? [], [sheets.data]);

  const columns: DataTableColumn<GangSheet>[] = [
    {
      accessorKey: "name",
      header: t("sheets.name", "Sheet"),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "status",
      header: t("sheets.status", "Status"),
      cell: ({ row }) => <SheetStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "transferCount",
      header: t("sheets.transfers", "Transfers"),
      cell: ({ row }) => row.original.transferCount,
    },
    {
      accessorKey: "lengthIn",
      header: t("sheets.length", "Length"),
      cell: ({ row }) => formatInches(row.original.lengthIn),
    },
    {
      accessorKey: "utilization",
      header: t("sheets.utilization", "Film use"),
      cell: ({ row }) => (
        <div className="flex w-28 items-center gap-2">
          <Progress value={row.original.utilization * 100} className="h-1.5" />
          <span className="w-9 text-right text-xs tabular-nums">
            {formatPct(row.original.utilization)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "vendorName",
      header: t("sheets.vendor", "Vendor"),
      cell: ({ row }) => row.original.vendorName ?? "—",
    },
    {
      accessorKey: "cost",
      header: t("sheets.cost", "Cost"),
      cell: ({ row }) => <Money cents={row.original.cost} />,
    },
    {
      accessorKey: "createdAt",
      header: t("sheets.created", "Created"),
      cell: ({ row }) => (
        <RelativeTime value={row.original.createdAt} className="text-muted-foreground" />
      ),
    },
  ];

  return (
    <Page
      title={t("nav.gangSheets")}
      description={t("sheets.subtitle", "22-inch DTF sheets built from ready items, rush first.")}
      actions={
        can("production.build") &&
        !buildOpen && (
          <Button onClick={() => setBuildOpen(true)}>
            <Layers />
            {t("today.buildSheets", "Build sheets")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {buildOpen && can("production.build") && <BuildPanel onClose={() => setBuildOpen(false)} />}
        <Tabs
          value={tab}
          onValueChange={(v) =>
            void navigate({
              search: (p) => ({ ...p, tab: v as (typeof TABS)[number] }),
              replace: true,
            })
          }
        >
          <TabsList>
            {TABS.map((v) => (
              <TabsTrigger key={v} value={v}>
                {t(`sheets.tab.${v}`, v)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {sheets.isError ? (
          <ErrorState error={sheets.error} onRetry={() => void sheets.refetch()} />
        ) : (
          <DataTable
            columns={columns as DataTableColumn<GangSheet, unknown>[]}
            data={rows}
            getRowId={(r) => r.id}
            isLoading={sheets.isPending}
            onRowClick={(r) =>
              void navigate({ to: "/production/sheets/$sheetId", params: { sheetId: r.id } })
            }
            hasMore={!!sheets.hasNextPage}
            isLoadingMore={sheets.isFetchingNextPage}
            onLoadMore={() => void sheets.fetchNextPage()}
            emptyTitle={t("sheets.empty", "No sheets here")}
            emptyDescription={t("sheets.emptyHint", "Build sheets from today's ready items.")}
            maxHeight="calc(100dvh - 16rem)"
          />
        )}
      </div>
    </Page>
  );
}

function BuildPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [cutoff, setCutoff] = useState(toDateInput(tomorrow));
  const [rushFirst, setRushFirst] = useState(true);
  const [includeReprints, setIncludeReprints] = useState(true);
  const [vendorId, setVendorId] = useState<string>("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [job, setJob] = useState<{ jobId: string; itemCount: number } | null>(null);
  const vendors = useQuery(orpc.vendors.list.queryOptions({ input: {}, retry: false }));

  const options = {
    dueBefore: endOfDayIso(cutoff),
    rushFirst,
    includeReprints,
    vendorConnectionId: vendorId || null,
    maxSheets: null,
  };
  const previewM = useMutation(
    orpc.production.batches.preview.mutationOptions({ onSuccess: setPreview }),
  );
  const buildM = useMutation(
    orpc.production.batches.build.mutationOptions({
      onSuccess: (res) => {
        setJob({ jobId: res.jobId, itemCount: res.itemCount });
        toast.success(
          t("sheets.buildStarted", "Building sheets for {{count}} items", { count: res.itemCount }),
        );
      },
    }),
  );

  const excludedByReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of preview?.excluded ?? []) m.set(e.reason, (m.get(e.reason) ?? 0) + 1);
    return BATCH_EXCLUSION_REASONS.filter((r) => m.has(r)).map((r) => [r, m.get(r) ?? 0] as const);
  }, [preview]);

  return (
    <Section
      title={t("sheets.buildTitle", "Build gang sheets")}
      description={t(
        "sheets.buildHint",
        "Pick a ship-by cutoff; eligible ready items are nested onto sheets.",
      )}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label={t("action.close")}
        >
          <X />
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-3">
          <Field
            label={t("sheets.cutoff", "Ship-by cutoff")}
            htmlFor="cutoff"
            hint={t("sheets.cutoffHint", "Includes items due by the end of this day")}
          >
            <Input
              id="cutoff"
              type="date"
              value={cutoff}
              onChange={(e) => {
                setCutoff(e.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <Field label={t("sheets.vendor", "Vendor")} htmlFor="vendor">
            <NativeSelect
              id="vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">{t("sheets.defaultVendor", "Default vendor")}</option>
              {vendors.data?.items.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.isDefault ? ` (${t("sheets.default", "default")})` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center justify-between gap-2 text-sm">
            {t("sheets.rushFirst", "Rush orders first")}
            <Switch checked={rushFirst} onCheckedChange={setRushFirst} />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            {t("sheets.includeReprints", "Include reprints")}
            <Switch checked={includeReprints} onCheckedChange={setIncludeReprints} />
          </label>
          <Field label={t("sheets.batchName", "Batch name (optional)")} htmlFor="batch-name">
            <Input
              id="batch-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => previewM.mutate(options)}
              disabled={previewM.isPending}
            >
              {previewM.isPending ? <Loader2 className="animate-spin" /> : <Eye />}
              {t("sheets.preview", "Preview")}
            </Button>
            <Button
              onClick={() => buildM.mutate({ ...options, name: name.trim() || undefined })}
              disabled={
                buildM.isPending || !!job || (preview !== null && preview.items.length === 0)
              }
            >
              {buildM.isPending ? <Loader2 className="animate-spin" /> : <Hammer />}
              {t("sheets.build", "Build")}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {job && (
            <JobProgress
              jobId={job.jobId}
              label={t("sheets.building", "Building {{count}} items", { count: job.itemCount })}
              onDone={(ids, ok) => {
                void queryClient.invalidateQueries({ queryKey: orpc.production.key() });
                void queryClient.invalidateQueries({ queryKey: orpc.today.key() });
                if (ok) {
                  toast.success(
                    t("sheets.built", "{{count}} sheet(s) ready", { count: ids.length }),
                    {
                      action:
                        ids[0] !== undefined
                          ? {
                              label: t("sheets.open", "Open"),
                              onClick: () =>
                                void navigate({
                                  to: "/production/sheets/$sheetId",
                                  params: { sheetId: ids[0] as string },
                                }),
                            }
                          : undefined,
                    },
                  );
                } else {
                  toast.error(t("sheets.buildFailed", "Sheet build failed"));
                }
              }}
            />
          )}
          {previewM.isError && <ErrorState error={previewM.error} compact />}
          {preview ? (
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Metric label={t("sheets.items", "Items")} value={preview.items.length} />
                <Metric label={t("sheets.estSheets", "Sheets")} value={preview.estimatedSheets} />
                <Metric
                  label={t("sheets.estLength", "Length")}
                  value={formatInches(preview.estimatedLengthIn)}
                />
                <Metric
                  label={t("sheets.utilization", "Film use")}
                  value={formatPct(preview.estimatedUtilization)}
                />
                <Metric
                  label={t("sheets.estCost", "Est. cost")}
                  value={<Money cents={preview.estimatedCost} />}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("sheets.rushCount", "{{rush}} rush · {{reprints}} reprints", {
                  rush: preview.items.filter((i) => i.isRush).length,
                  reprints: preview.items.filter((i) => i.isReprint).length,
                })}
              </p>
              {excludedByReason.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1 text-xs font-medium">
                    {t("sheets.excluded", "{{count}} items not included", {
                      count: preview.excluded.length,
                    })}
                  </p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {excludedByReason.map(([reason, n]) => (
                      <li key={reason}>
                        {t(`exclusion.${reason}`, reason.replace(/_/g, " "))}:{" "}
                        <span className="tabular-nums text-foreground">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.items.length > 0 && (
                <ul className="mt-3 max-h-48 overflow-y-auto border-t border-border pt-2 text-xs">
                  {preview.items.map((i) => (
                    <li key={i.orderItemId} className="flex justify-between gap-2 py-0.5">
                      <span className="truncate">
                        #{i.orderNo} · {i.designName}
                        {i.isRush && (
                          <span className="ml-1 text-danger">{t("orders.rush", "Rush")}</span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatInches(i.widthIn)} × {formatInches(i.heightIn)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            !job && (
              <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t(
                  "sheets.previewEmpty",
                  "Preview to see how many items fit and what the film will cost.",
                )}
              </p>
            )
          )}
        </div>
      </div>
    </Section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

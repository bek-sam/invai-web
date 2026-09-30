import {
  BATCH_STRATEGIES,
  CHANNEL_RULES,
  type Shipment,
  type ShipQueueEntry,
} from "@invai/contracts";
import {
  Badge,
  Button,
  ChannelBadge,
  cn,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Money,
  RelativeTime,
  ShipByBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  Download,
  Loader2,
  Printer,
  RotateCw,
  Settings2,
  Tag,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ShipmentStatusBadge } from "../../components/badges";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Field, NativeSelect, Page } from "../../components/page";
import { ErrorState, SkeletonRows } from "../../components/states";
import { errorInfo, errorMessage } from "../../lib/errors";
import { formatDate, orderLabel } from "../../lib/format";
import { useCan } from "../../lib/me";
import { pollJob } from "../../lib/poll-job";
import { client, orpc } from "../../lib/rpc";
import { openInNewTab } from "../../lib/upload";

const TABS = ["queue", "shipments", "scanForms", "tracking", "settings"] as const;

/** The four CSV-only (pendingApproval-adapter) channels `shipping.exportTracking` supports. */
const EXPORT_CHANNELS = ["etsy", "amazon", "tiktok", "walmart"] as const;
type ExportChannel = (typeof EXPORT_CHANNELS)[number];

/** Where to upload each marketplace's file, checked against its current seller help docs. */
const EXPORT_WHERE: Record<ExportChannel, string> = {
  etsy: "Etsy: Shop Manager → Orders & Shipping → add tracking to each order, or use a bulk-upload app built on Etsy's tracking API with this file.",
  amazon: "Amazon: Seller Central → Orders → Upload Order Related Files → Shipping Confirmation.",
  tiktok: "TikTok Shop: Seller Center → Orders → Manage orders → Upload → Add Tracking No.",
  walmart: "Walmart: Seller Center → Order Management → Bulk Order Update, then upload this file.",
};

export const Route = createFileRoute("/_app/shipping")({
  validateSearch: z.object({ tab: z.enum(TABS).optional().catch(undefined) }),
  component: ShippingPage,
});

function useInvalidateShipping() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: orpc.shipping.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.today.key() });
  };
}

async function printLabels(shipmentIds: string[]) {
  const pdf = await client.shipping.batchLabelPdf({ shipmentIds, order: "bin" });
  openInNewTab(pdf.url);
  return pdf;
}

function ShippingPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shipping" });
  return (
    <Page
      title={t("nav.shipping")}
      description={t(
        "ship.subtitle",
        "Rate-shop, buy labels, print 4×6 in pack order, push tracking.",
      )}
      actions={
        can("shipping.manage") && (
          <Button asChild variant="outline">
            <Link to="/settings/shipping">
              <Settings2 />
              {t("shipSettings.title", "Shipping settings")}
            </Link>
          </Button>
        )
      }
    >
      <Tabs
        value={search.tab ?? "queue"}
        onValueChange={(v) =>
          void navigate({ search: { tab: v as (typeof TABS)[number] }, replace: true })
        }
      >
        <div className="-mx-1 mb-3 overflow-x-auto px-1">
          <TabsList>
            <TabsTrigger value="queue">{t("ship.queue", "Ready to ship")}</TabsTrigger>
            <TabsTrigger value="shipments">{t("ship.shipments", "Shipments")}</TabsTrigger>
            <TabsTrigger value="scanForms">{t("ship.scanForms", "End of day")}</TabsTrigger>
            <TabsTrigger value="tracking">{t("ship.tracking", "Tracking push")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="queue">
          <Queue />
        </TabsContent>
        <TabsContent value="shipments">
          <Shipments />
        </TabsContent>
        <TabsContent value="scanForms">
          <ScanForms />
        </TabsContent>
        <TabsContent value="tracking">
          <ExportTracking />
          <TrackingPush />
        </TabsContent>
        <TabsContent value="settings">
          {/* Settings moved to their own page; old links still land there. */}
          <Navigate to="/settings/shipping" replace />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

type BatchOutcome =
  | { kind: "aborted" }
  | { kind: "timeout" }
  | {
      kind: "done";
      ids: string[];
      labeled: number;
      failed: number;
      /** null when some bought shipment couldn't be read back for its postage. */
      totalPostage: number | null;
    };

function Queue() {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateShipping();
  const [atRisk, setAtRisk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rating, setRating] = useState<ShipQueueEntry | null>(null);
  const [strategy, setStrategy] = useState<(typeof BATCH_STRATEGIES)[number]>("cheapest_on_time");
  const q = useInfiniteQuery(
    orpc.shipping.queue.infiniteOptions({
      input: (cursor: string | undefined) => ({ atRisk: atRisk || undefined, cursor, limit: 100 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  // Labels the last batch bought, printed from a click (a tab opened later is popup-blocked).
  const [toPrint, setToPrint] = useState<string[]>([]);
  // Stops the batch poll when the page goes away.
  const pollAbort = useRef<AbortController | null>(null);
  useEffect(() => () => pollAbort.current?.abort(), []);
  const print = (ids: string[]) =>
    void printLabels(ids).then(
      () => setToPrint([]),
      (err: unknown) => toast.error(errorMessage(err)),
    );
  const batch = useMutation({
    mutationFn: async (orderIds: string[]): Promise<BatchOutcome> => {
      const res = await client.shipping.batchBuy({ orderIds, strategy });
      if (res.status !== "queued") {
        const ids = res.results.flatMap((r) =>
          r.status === "labeled" && r.shipmentId ? [r.shipmentId] : [],
        );
        return { kind: "done", ids, ...res };
      }
      // The labels are bought in a background job: follow it (3 min at most), then offer to print.
      pollAbort.current?.abort();
      const abort = new AbortController();
      pollAbort.current = abort;
      const out = await pollJob(() => client.production.jobs.get({ id: res.jobId }), {
        signal: abort.signal,
        deadlineMs: 180_000,
      });
      if (out.kind === "aborted") return { kind: "aborted" };
      if (out.kind === "timeout") return { kind: "timeout" };
      if (out.job.status === "failed")
        throw new Error(out.job.error ?? out.job.message ?? "The label batch failed");
      const ids = out.job.resultIds;
      // Postage is a nice-to-have: a shipment that can't be read just leaves it out.
      const shipments = await Promise.allSettled(
        ids.map((id) => client.shipping.shipments.get({ id })),
      );
      const read = shipments.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      return {
        kind: "done",
        ids,
        labeled: ids.length,
        failed: orderIds.length - ids.length,
        totalPostage:
          read.length === ids.length ? read.reduce((sum, s) => sum + s.postage, 0) : null,
      };
    },
    onSuccess: (out) => {
      if (out.kind === "aborted") return;
      if (out.kind === "timeout") {
        setSelected(new Set());
        toast.info(
          t(
            "ship.batchStillBuying",
            "Still buying labels in the background. They'll show up under Shipments when they're done.",
          ),
        );
        return;
      }
      setToPrint(out.ids);
      toast.success(t("ship.batchDone", "{{n}} labels bought", { n: out.labeled }), {
        description: [
          out.totalPostage === null
            ? ""
            : t("ship.postage", "Postage {{amount}}", {
                amount: `$${(out.totalPostage / 100).toFixed(2)}`,
              }),
          out.failed ? t("orders.someFailed", "{{count}} failed", { count: out.failed }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
        ...(out.ids.length
          ? {
              duration: 30_000,
              action: {
                label: t("ship.printSelected", "Print {{count}} labels", {
                  count: out.ids.length,
                }),
                onClick: () => print(out.ids),
              },
            }
          : {}),
      });
      setSelected(new Set());
    },
    // Whatever happened, the queue may have changed.
    onSettled: () => invalidate(),
  });
  const columns: DataTableColumn<ShipQueueEntry>[] = [
    {
      accessorKey: "orderNo",
      header: t("orders.order", "Order"),
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <Link
            to="/orders"
            search={{ order: row.original.orderId }}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {orderLabel(row.original.orderNo)}
          </Link>
          {row.original.isRush && <Zap className="size-3.5 text-danger" />}
        </span>
      ),
    },
    {
      accessorKey: "channel",
      header: t("orders.channel", "Channel"),
      cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
    },
    {
      accessorKey: "shipBy",
      header: t("orders.shipBy", "Ship by"),
      cell: ({ row }) => <ShipByBadge shipBy={row.original.shipBy} />,
    },
    { accessorKey: "unitCount", header: t("orders.itemsCol", "Items") },
    {
      accessorKey: "estimatedWeightOz",
      header: t("ship.weight", "Weight"),
      cell: ({ row }) => `${row.original.estimatedWeightOz.toFixed(1)} oz`,
    },
    {
      accessorKey: "binCode",
      header: t("orders.bin", "Bin"),
      cell: ({ row }) => row.original.binCode ?? "—",
    },
    {
      accessorKey: "shippingMethod",
      header: t("orders.method", "Method"),
      cell: ({ row }) => row.original.shippingMethod ?? "—",
    },
    {
      accessorKey: "addressValid",
      header: t("ship.address", "Address"),
      cell: ({ row }) =>
        row.original.addressValid ? (
          <span className="text-success">✓</span>
        ) : (
          <span className="flex items-center gap-1 text-danger">
            <AlertTriangle className="size-3.5" />
            {t("ship.check", "Check")}
          </span>
        ),
    },
    {
      id: "buy",
      header: "",
      cell: ({ row }) =>
        can("shipping.buy") && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setRating(row.original);
            }}
          >
            <Tag />
            {t("ship.rates", "Rates")}
          </Button>
        ),
    },
  ];
  const selectedIds = [...selected];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={atRisk} onCheckedChange={setAtRisk} />
          {t("today.atRisk", "At risk")}
        </label>
        {q.data && (
          <span className="text-sm text-muted-foreground">
            {t("ship.total", "{{n}} orders packed", { n: q.data.pages[0]?.total ?? 0 })}
          </span>
        )}
        {can("shipping.buy") && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label={t("ship.strategyAria", "Strategy")}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof strategy)}
            >
              {BATCH_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {t(`ship.strategy.${s}`, s.replace(/_/g, " "))}
                </option>
              ))}
            </NativeSelect>
            {toPrint.length > 0 && (
              <Button variant="outline" onClick={() => print(toPrint)}>
                <Printer />
                {t("ship.printSelected", "Print {{count}} labels", { count: toPrint.length })}
              </Button>
            )}
            <Button
              onClick={() =>
                batch.mutate(
                  selectedIds.length ? selectedIds : rows.slice(0, 100).map((r) => r.orderId),
                )
              }
              disabled={rows.length === 0 || batch.isPending}
            >
              {batch.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
              {selectedIds.length
                ? t("ship.buySelected", "Buy & print {{count}}", { count: selectedIds.length })
                : t("ship.buyAll", "Buy & print all")}
            </Button>
          </div>
        )}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<ShipQueueEntry, unknown>[]}
          data={rows}
          getRowId={(r) => r.orderId}
          isLoading={q.isPending}
          enableRowSelection={can("shipping.buy")}
          rowSelection={Object.fromEntries([...selected].map((k) => [k, true]))}
          onRowSelectionChange={(s) => setSelected(new Set(Object.keys(s).filter((k) => s[k])))}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          emptyTitle={t("ship.queueEmpty", "Nothing packed and waiting")}
          emptyDescription={t(
            "ship.queueEmptyHint",
            "Orders appear here once every unit is packed.",
          )}
          maxHeight="calc(100dvh - 17rem)"
          estimateRowHeightPx={48}
        />
      )}
      {rating && <RatesDialog entry={rating} onClose={() => setRating(null)} />}
    </div>
  );
}

function RatesDialog({ entry, onClose }: { entry: ShipQueueEntry; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateShipping();
  const presets = useQuery(orpc.shipping.settings.get.queryOptions({ input: {}, retry: false }));
  const [presetId, setPresetId] = useState(entry.suggestedPresetId ?? "");
  const [weight, setWeight] = useState(String(entry.estimatedWeightOz.toFixed(1)));
  const rates = useMutation(orpc.shipping.rates.mutationOptions({ meta: { silent: true } }));
  const [rateId, setRateId] = useState<string | null>(null);
  // B-25: a rate can expire (carrier quotes are time-limited) between fetching and buying. Rather
  // than a generic error toast, buy again re-fetches at the current price and asks the office to
  // confirm it, so they always see what they're about to pay.
  const [expired, setExpired] = useState(false);
  const fetchRates = () =>
    rates.mutate(
      {
        orderId: entry.orderId,
        packagePresetId: presetId || undefined,
        parcel: Number(weight) > 0 ? { weightOz: Number(weight) } : undefined,
      },
      {
        onSuccess: (r) => {
          setExpired(false);
          setRateId(r.rates.find((x) => x.cheapest)?.rateId ?? r.rates[0]?.rateId ?? null);
        },
      },
    );
  const buy = useMutation(
    orpc.shipping.buy.mutationOptions({
      meta: { silent: true },
      onSuccess: async (s) => {
        toast.success(t("ship.bought", "Label bought: {{code}}", { code: s.trackingCode ?? "" }));
        invalidate();
        await printLabels([s.id]).catch(() => undefined);
        onClose();
      },
      onError: (err) => {
        if (errorInfo(err).code === "RATE_EXPIRED") {
          setExpired(true);
          fetchRates();
        } else {
          toast.error(errorMessage(err));
        }
      },
    }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("ship.ratesFor", "Rates for #{{no}}", { no: entry.orderNo })}
          </DialogTitle>
          <DialogDescription>
            {t("ship.ratesHint", "{{count}} items · ship by {{date}}", {
              count: entry.unitCount,
              date: formatDate(entry.shipBy),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ship.package", "Package")} htmlFor="r-preset">
            <NativeSelect
              id="r-preset"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              <option value="">{t("ship.autoPackage", "Automatic")}</option>
              {presets.data?.packagePresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("ship.weightOz", "Weight (oz)")} htmlFor="r-weight">
            <Input
              id="r-weight"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
        </div>
        <Button variant="outline" onClick={fetchRates} disabled={rates.isPending}>
          {rates.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />}
          {rates.data ? t("ship.refreshRates", "Refresh rates") : t("ship.getRates", "Get rates")}
        </Button>
        {rates.isError && <ErrorState error={rates.error} compact />}
        {expired && (
          <p className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {t(
              "ship.rateExpired",
              "That rate expired. Here's the current price -- check it and buy again.",
            )}
          </p>
        )}
        {rates.data && (
          <ul className="flex flex-col gap-1.5" aria-label={t("ship.rates", "Rates")}>
            {rates.data.rates.map((r) => (
              <li key={r.rateId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm",
                    rateId === r.rateId
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <input
                    type="radio"
                    name="rate"
                    className="accent-[var(--color-primary)]"
                    checked={rateId === r.rateId}
                    onChange={() => setRateId(r.rateId)}
                  />
                  <span className="flex-1">
                    <span className="font-medium uppercase">{r.carrier}</span> {r.serviceLabel}
                    <span className="block text-xs text-muted-foreground">
                      {r.deliveryDays ? t("ship.days", "{{n}} days", { n: r.deliveryDays }) : "—"}
                      {r.estimatedDeliveryAt ? ` · ${formatDate(r.estimatedDeliveryAt)}` : ""}
                    </span>
                  </span>
                  {r.cheapest && <Badge variant="success">{t("ship.cheapest", "Cheapest")}</Badge>}
                  {r.fastest && <Badge variant="info">{t("ship.fastest", "Fastest")}</Badge>}
                  <Money cents={r.rate} className="font-semibold" />
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!rates.data || !rateId || buy.isPending}
            onClick={() =>
              rates.data && rateId && buy.mutate({ shipmentId: rates.data.shipmentId, rateId })
            }
          >
            {buy.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
            {t("ship.buyPrint", "Buy & print")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Shipments() {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateShipping();
  const [selected, setSelected] = useState<Record<string, true>>({});
  const q = useInfiniteQuery(
    orpc.shipping.shipments.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 100 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const print = useMutation({ mutationFn: printLabels });
  const [voiding, setVoiding] = useState<Shipment | null>(null);
  const voidLabel = useMutation(
    orpc.shipping.void.mutationOptions({
      meta: { silent: true },
      onSuccess: () => {
        setVoiding(null);
        toast.success(t("ship.voided", "Label voided"), {
          description: t(
            "ship.voidRefundNote",
            "The postage refund can show as pending with the carrier for a few days.",
          ),
        });
        invalidate();
      },
      onError: (err) => {
        toast.error(voidErrorText(err, t));
        invalidate();
      },
    }),
  );
  const ids = Object.keys(selected).filter((k) => selected[k]);
  const columns: DataTableColumn<Shipment>[] = [
    {
      accessorKey: "orderNo",
      header: t("orders.order", "Order"),
      cell: ({ row }) => <span className="font-medium">{orderLabel(row.original.orderNo)}</span>,
    },
    {
      accessorKey: "status",
      header: t("sheets.status", "Status"),
      cell: ({ row }) => <ShipmentStatusBadge status={row.original.status} />,
    },
    {
      id: "service",
      header: t("ship.service", "Service"),
      cell: ({ row }) =>
        row.original.carrier
          ? `${row.original.carrier.toUpperCase()} ${row.original.service ?? ""}`
          : "—",
    },
    {
      accessorKey: "trackingCode",
      header: t("ship.trackingCode", "Tracking"),
      cell: ({ row }) =>
        row.original.trackingUrl ? (
          <a
            href={row.original.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.trackingCode}
          </a>
        ) : (
          <span className="font-mono text-xs">{row.original.trackingCode ?? "—"}</span>
        ),
    },
    {
      id: "push",
      header: t("ship.pushed", "Pushed to channel"),
      cell: ({ row }) => {
        // T-7-1 (B-68): once a CSV-only channel's shipment went into a tracking export, it
        // reads as "uploaded" regardless of the underlying push status (which is always
        // `not_required` for these channels -- there's no API to push to).
        if (row.original.exportedAt) {
          return (
            <Badge variant="success" title={formatDate(row.original.exportedAt)}>
              {t("pushStatus.exported_manual", "Tracking uploaded (manual)")}
            </Badge>
          );
        }
        const p = row.original.trackingPush;
        const tone =
          p.status === "pushed"
            ? "success"
            : p.status === "failed"
              ? "danger"
              : p.status === "pending"
                ? "warning"
                : "secondary";
        return (
          <Badge variant={tone} title={p.error ?? undefined}>
            {t(`pushStatus.${p.status}`, p.status.replace(/_/g, " "))}
          </Badge>
        );
      },
    },
    {
      accessorKey: "postage",
      header: t("ship.postageCol", "Postage"),
      cell: ({ row }) => <Money cents={row.original.postage + row.original.labelFee} />,
    },
    {
      accessorKey: "labeledAt",
      header: t("ship.labeled", "Labeled"),
      cell: ({ row }) =>
        row.original.labeledAt ? (
          <RelativeTime value={row.original.labeledAt} className="text-muted-foreground" />
        ) : (
          "—"
        ),
    },
    {
      id: "void",
      header: "",
      cell: ({ row }) =>
        can("shipping.buy") &&
        row.original.status === "labeled" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={(e) => {
              e.stopPropagation();
              setVoiding(row.original);
            }}
          >
            {t("ship.void", "Void")}
          </Button>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={ids.length === 0 || print.isPending}
          onClick={() => print.mutate(ids)}
        >
          {print.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
          {t("ship.printSelected", "Print {{count}} labels", { count: ids.length })}
        </Button>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<Shipment, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={q.isPending}
          enableRowSelection
          rowSelection={selected}
          onRowSelectionChange={setSelected}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          emptyTitle={t("ship.noShipments", "No shipments yet")}
          maxHeight="calc(100dvh - 17rem)"
        />
      )}
      <VoidLabelDialog
        shipment={voiding}
        pending={voidLabel.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={(s) => voidLabel.mutate({ id: s.id })}
      />
    </div>
  );
}

/**
 * USPS end-of-day SCAN form (B-25): one barcode the carrier scans at pickup to accept every label
 * bought today at once. `create` is idempotent per carrier + day (the backend returns the
 * existing form on a second click), so there's no confirm dialog -- clicking it twice is safe.
 */
function ScanForms() {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const q = useInfiniteQuery(
    orpc.shipping.scanForms.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 50 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const create = useMutation(
    orpc.shipping.scanForms.create.mutationOptions({
      meta: { silent: true },
      onSuccess: (f) => {
        toast.success(
          t("ship.scanFormCreated", "SCAN form ready: {{n}} labels", { n: f.labelCount }),
        );
        void queryClient.invalidateQueries({ queryKey: orpc.shipping.scanForms.key() });
      },
      onError: (err) => {
        if (errorInfo(err).code === "NO_LABELS_TO_MANIFEST") {
          toast.info(
            t("ship.noLabelsToManifest", "No labels for today are waiting for a SCAN form."),
          );
        } else {
          toast.error(errorMessage(err));
        }
      },
    }),
  );
  const download = useMutation({
    mutationFn: (fileKey: string) =>
      client.files.downloadUrl({ fileKey, disposition: "attachment" }),
    onSuccess: (d) => openInNewTab(d.url),
  });
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      accessorKey: "date",
      header: t("ship.scanFormDate", "Date"),
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      accessorKey: "carrier",
      header: t("ship.scanFormCarrier", "Carrier"),
      cell: ({ row }) => row.original.carrier.toUpperCase(),
    },
    { accessorKey: "labelCount", header: t("ship.scanFormLabels", "Labels") },
    {
      id: "download",
      header: "",
      cell: ({ row }) =>
        row.original.fileKey ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              download.mutate(row.original.fileKey as string);
            }}
            disabled={download.isPending}
          >
            <Download />
            {t("ship.downloadForm", "Download")}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("ship.noFormFile", "No file")}</span>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t(
            "ship.scanFormsHint",
            "One barcode the carrier scans at pickup to accept every label bought today.",
          )}
        </p>
        {can("shipping.manage") && (
          <Button onClick={() => create.mutate({ carrier: "usps" })} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Printer />}
            {t("ship.createScanForm", "Create today's SCAN form")}
          </Button>
        )}
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={q.isPending}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          emptyTitle={t("ship.noScanForms", "No SCAN forms yet")}
          emptyDescription={t("ship.noScanFormsHint", "Create one once today's labels are bought.")}
          maxHeight="calc(100dvh - 20rem)"
        />
      )}
    </div>
  );
}

/** What went wrong with a void, in words the office can act on. */
function voidErrorText(err: unknown, t: TFunction): string {
  const info = errorInfo(err);
  const detail =
    info.data && typeof info.data === "object" && "detail" in info.data
      ? String((info.data as { detail: unknown }).detail)
      : "";
  if (info.code === "VOID_REJECTED") {
    if (/tracking was already sent/i.test(detail))
      return t(
        "ship.voidErr.pushed",
        "Tracking was already sent to the buyer's channel, so this label can't be voided here. Cancel or refund the order on the channel instead.",
      );
    if (/already shipped|can't be voided/i.test(detail))
      return t(
        "ship.voidErr.scanned",
        "The carrier already has this package, so the label can't be voided.",
      );
    return t("ship.voidErr.refused", "The carrier refused to void this label. It's still active.");
  }
  if (info.code === "UPSTREAM_FAILED")
    return t(
      "ship.voidErr.unknown",
      "We couldn't confirm the void with the carrier. Press Void again to check.",
    );
  if (info.code === "CONFLICT")
    return t(
      "ship.voidErr.busy",
      "Something else is happening with this label right now. Try again in a minute.",
    );
  return info.message;
}

function VoidLabelDialog({
  shipment: s,
  pending,
  onClose,
  onConfirm,
}: {
  shipment: Shipment | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (s: Shipment) => void;
}) {
  const { t } = useTranslation();
  const pushed = s?.trackingPush.status === "pushed";
  return (
    <ConfirmDialog
      open={!!s}
      onOpenChange={(o) => !o && onClose()}
      title={t("ship.voidTitle", "Void the label for {{order}}?", {
        order: s ? orderLabel(s.orderNo) : "",
      })}
      description={t(
        "ship.voidBody",
        "This voids the current label and asks the carrier for the postage back. You can't undo it from here; buy a new label if the order still ships.",
      )}
      confirmLabel={pushed ? t("ship.voidGotIt", "Got it") : t("ship.voidConfirm", "Void label")}
      destructive={!pushed}
      pending={pending}
      onConfirm={() => (pushed ? onClose() : s && onConfirm(s))}
    >
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        <li>
          {t(
            "ship.voidRefund",
            "The refund may show as pending for a few days instead of right away. That's normal.",
          )}
        </li>
        <li>
          {t(
            "ship.voidScanRule",
            "Only a label the carrier hasn't scanned yet can be voided. Orders from CSV channels stay voidable until the package is scanned.",
          )}
        </li>
        <li>
          {t(
            "ship.voidPushRule",
            "Once tracking is sent to the buyer's channel, void isn't possible here. Cancel or refund the order on the channel instead.",
          )}
        </li>
      </ul>
      {pushed && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(
            "ship.voidErr.pushed",
            "Tracking was already sent to the buyer's channel, so this label can't be voided here. Cancel or refund the order on the channel instead.",
          )}
        </p>
      )}
    </ConfirmDialog>
  );
}

/** T-7-1 (B-68): download a CSV/TSV of tracking, in the marketplace's own upload format, for
 * shipments labeled since the channel's last export (or a chosen range). */
function ExportTracking() {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateShipping();
  const [channel, setChannel] = useState<ExportChannel>("etsy");
  const label = CHANNEL_RULES[channel].label;
  const exportMutation = useMutation({
    mutationFn: async () => {
      const out = await client.shipping.exportTracking({ channel, since: null });
      if (out.count > 0) {
        const dl = await client.files.downloadUrl({ fileKey: out.key, disposition: "attachment" });
        openInNewTab(dl.url);
      }
      return out;
    },
    onSuccess: (out) => {
      toast[out.count > 0 ? "success" : "info"](
        out.count > 0
          ? t("ship.exportDone", "{{n}} shipments exported for {{channel}}", {
              n: out.count,
              channel: label,
            })
          : t("ship.exportEmpty", "Nothing new to export for {{channel}}", { channel: label }),
      );
      invalidate();
    },
  });
  if (!can("shipping.manage")) return null;
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label={t("ship.exportChannel", "Channel")}
          value={channel}
          onChange={(e) => setChannel(e.target.value as ExportChannel)}
        >
          {EXPORT_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_RULES[c].label}
            </option>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          {t("ship.exportTracking", "Export tracking for {{channel}}", { channel: label })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(`ship.exportWhere.${channel}`, EXPORT_WHERE[channel])}
      </p>
    </div>
  );
}

function TrackingPush() {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateShipping();
  const q = useQuery(orpc.shipping.trackingPush.list.queryOptions({ input: { limit: 200 } }));
  const retry = useMutation(
    orpc.shipping.trackingPush.retry.mutationOptions({
      onSuccess: () => {
        toast.success(t("ship.retried", "Retry queued"));
        invalidate();
      },
    }),
  );
  if (q.isPending) return <SkeletonRows rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.items.length === 0)
    return (
      <p className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        {t("ship.allPushed", "All tracking numbers reached their channels.")}
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t("orders.order", "Order")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("orders.channel", "Channel")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("sheets.status", "Status")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("ship.error", "Error")}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {q.data.items.map((p) => (
            <tr key={p.shipmentId} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{orderLabel(p.orderNo)}</td>
              <td className="px-3 py-2">
                <ChannelBadge channel={p.channel} />
              </td>
              <td className="px-3 py-2">
                <Badge variant={p.status === "failed" ? "danger" : "warning"}>
                  {t(`pushStatus.${p.status}`, p.status)}
                </Badge>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("ship.attempts", "{{n}} attempts", { n: p.attempts })}
                </span>
              </td>
              <td
                className="max-w-xs truncate px-3 py-2 text-xs text-danger"
                title={p.error ?? undefined}
              >
                {p.error ?? "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {can("shipping.buy") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry.mutate({ shipmentId: p.shipmentId })}
                    disabled={retry.isPending}
                  >
                    <RotateCw />
                    {t("action.retry")}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

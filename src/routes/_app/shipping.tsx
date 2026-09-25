import {
  type Address,
  BATCH_STRATEGIES,
  type Shipment,
  type ShippingSettings,
  type ShipQueueEntry,
} from "@invai/contracts";
import {
  Badge,
  Button,
  ChannelBadge,
  Checkbox,
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
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Plus, Printer, RotateCw, Tag, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ShipmentStatusBadge } from "../../components/badges";
import { Field, NativeSelect, Page, Section } from "../../components/page";
import { ErrorState, SkeletonRows } from "../../components/states";
import { formatDate, orderLabel } from "../../lib/format";
import { useCan } from "../../lib/me";
import { client, orpc } from "../../lib/rpc";
import { openInNewTab } from "../../lib/upload";

const TABS = ["queue", "shipments", "tracking", "settings"] as const;

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
    >
      <Tabs
        value={search.tab ?? "queue"}
        onValueChange={(v) =>
          void navigate({ search: { tab: v as (typeof TABS)[number] }, replace: true })
        }
      >
        <TabsList className="mb-3">
          <TabsTrigger value="queue">{t("ship.queue", "Ready to ship")}</TabsTrigger>
          <TabsTrigger value="shipments">{t("ship.shipments", "Shipments")}</TabsTrigger>
          <TabsTrigger value="tracking">{t("ship.tracking", "Tracking push")}</TabsTrigger>
          {can("shipping.manage") && (
            <TabsTrigger value="settings">{t("nav.settings")}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="queue">
          <Queue />
        </TabsContent>
        <TabsContent value="shipments">
          <Shipments />
        </TabsContent>
        <TabsContent value="tracking">
          <TrackingPush />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsForm />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

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
  const batch = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const res = await client.shipping.batchBuy({ orderIds, strategy });
      if (res.status !== "queued") {
        const ids = res.results.flatMap((r) =>
          r.status === "labeled" && r.shipmentId ? [r.shipmentId] : [],
        );
        if (ids.length) await printLabels(ids);
        return res;
      }
      // The labels are bought in a background job: follow it, then print what it bought.
      let job = await client.production.jobs.get({ id: res.jobId });
      while (job.status !== "done" && job.status !== "failed") {
        await new Promise((r) => setTimeout(r, 1500));
        job = await client.production.jobs.get({ id: res.jobId });
      }
      if (job.status === "failed") throw new Error(job.error ?? job.message ?? "Batch failed");
      const ids = job.resultIds;
      const shipments = await Promise.all(ids.map((id) => client.shipping.shipments.get({ id })));
      if (ids.length) await printLabels(ids);
      return {
        ...res,
        labeled: ids.length,
        failed: orderIds.length - ids.length,
        totalPostage: shipments.reduce((sum, s) => sum + s.postage, 0),
      };
    },
    onSuccess: (res) => {
      toast.success(t("ship.batchDone", "{{n}} labels bought", { n: res.labeled }), {
        description: [
          t("ship.postage", "Postage {{amount}}", {
            amount: `$${(res.totalPostage / 100).toFixed(2)}`,
          }),
          res.failed ? t("orders.someFailed", "{{count}} failed", { count: res.failed }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
      setSelected(new Set());
      invalidate();
    },
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
  const buy = useMutation(
    orpc.shipping.buy.mutationOptions({
      onSuccess: async (s) => {
        toast.success(t("ship.bought", "Label bought: {{code}}", { code: s.trackingCode ?? "" }));
        invalidate();
        await printLabels([s.id]).catch(() => undefined);
        onClose();
      },
    }),
  );
  const fetchRates = () =>
    rates.mutate(
      {
        orderId: entry.orderId,
        packagePresetId: presetId || undefined,
        parcel: Number(weight) > 0 ? { weightOz: Number(weight) } : undefined,
      },
      {
        onSuccess: (r) =>
          setRateId(r.rates.find((x) => x.cheapest)?.rateId ?? r.rates[0]?.rateId ?? null),
      },
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
  const voidLabel = useMutation(
    orpc.shipping.void.mutationOptions({
      onSuccess: () => {
        toast.success(t("ship.voided", "Label voided"));
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
              voidLabel.mutate({ id: row.original.id });
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

const EMPTY_ADDRESS: Address = {
  name: "",
  company: null,
  street1: "",
  street2: null,
  city: "",
  state: "",
  zip: "",
  country: "US",
  phone: null,
  email: null,
};

function SettingsForm() {
  const q = useQuery(orpc.shipping.settings.get.queryOptions({ input: {} }));
  if (q.isPending) return <SkeletonRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return <SettingsEditor key={JSON.stringify(q.data)} settings={q.data} />;
}

function SettingsEditor({ settings }: { settings: ShippingSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState<Address>(settings.fromAddress ?? EMPTY_ADDRESS);
  const [presets, setPresets] = useState(settings.packagePresets.map((p) => ({ ...p })));
  const [strategy, setStrategy] = useState(settings.defaultStrategy);
  const [push, setPush] = useState(settings.trackingPushEnabled);
  const save = useMutation(
    orpc.shipping.settings.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings.saved", "Settings saved"));
        void queryClient.invalidateQueries({ queryKey: orpc.shipping.settings.key() });
      },
    }),
  );
  const addr = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFrom({
      ...from,
      [k]:
        e.target.value ||
        (k === "company" || k === "street2" || k === "phone" || k === "email" ? null : ""),
    });
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Section
        title={t("ship.fromAddress", "Ship-from address")}
        description={t("ship.provider", "Carrier provider: {{p}}", { p: settings.carrierProvider })}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", t("ship.name", "Name")],
              ["company", t("ship.company", "Company")],
              ["street1", t("ship.street1", "Street")],
              ["street2", t("ship.street2", "Apt, suite")],
              ["city", t("ship.city", "City")],
              ["state", t("ship.state", "State")],
              ["zip", t("ship.zip", "ZIP")],
              ["phone", t("ship.phone", "Phone")],
            ] as [keyof Address, string][]
          ).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`from-${k}`}>
              <Input id={`from-${k}`} value={(from[k] as string | null) ?? ""} onChange={addr(k)} />
            </Field>
          ))}
        </div>
      </Section>
      <Section
        title={t("ship.presets", "Package presets")}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPresets([
                ...presets,
                {
                  id: "",
                  name: "Poly mailer",
                  lengthIn: 12,
                  widthIn: 10,
                  heightIn: 1,
                  tareOz: 1,
                  maxUnits: 2,
                  isDefault: presets.length === 0,
                },
              ])
            }
          >
            <Plus />
            {t("ship.addPreset", "Add preset")}
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          {presets.map((p, i) => (
            <div
              key={p.id || `new-${i}`}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[2fr_repeat(5,1fr)_auto_auto]"
            >
              <Field label={t("ship.name", "Name")}>
                <Input
                  value={p.name}
                  onChange={(e) =>
                    setPresets(
                      presets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
              </Field>
              {(["lengthIn", "widthIn", "heightIn", "tareOz", "maxUnits"] as const).map((k) => (
                <Field
                  key={k}
                  label={
                    {
                      lengthIn: "L (in)",
                      widthIn: "W (in)",
                      heightIn: "H (in)",
                      tareOz: t("ship.tare", "Tare (oz)"),
                      maxUnits: t("ship.maxUnits", "Max units"),
                    }[k]
                  }
                >
                  <Input
                    type="number"
                    step="0.1"
                    value={p[k] ?? ""}
                    onChange={(e) =>
                      setPresets(
                        presets.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                [k]:
                                  e.target.value === "" && k === "maxUnits"
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              <label className="flex h-9 items-center gap-1.5 text-xs">
                <Checkbox
                  checked={p.isDefault}
                  onCheckedChange={(v) =>
                    setPresets(
                      presets.map((x, j) => ({
                        ...x,
                        isDefault: j === i ? !!v : v ? false : x.isDefault,
                      })),
                    )
                  }
                />
                {t("sheets.default", "default")}
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPresets(presets.filter((_, j) => j !== i))}
                aria-label={t("action.delete")}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t("ship.defaults", "Defaults")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ship.strategyLabel", "Batch strategy")} htmlFor="s-strategy">
            <NativeSelect
              id="s-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof strategy)}
            >
              {BATCH_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {t(`ship.strategy.${s}`, s.replace(/_/g, " "))}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <Switch checked={push} onCheckedChange={setPush} />
            {t("ship.pushTracking", "Push tracking to channels automatically")}
          </label>
        </div>
      </Section>
      <div className="flex justify-end">
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              fromAddress: from.street1 ? from : null,
              packagePresets: presets.map(({ id, ...rest }) => (id ? { id, ...rest } : rest)),
              defaultStrategy: strategy,
              trackingPushEnabled: push,
            })
          }
        >
          {save.isPending && <Loader2 className="animate-spin" />}
          {t("action.save")}
        </Button>
      </div>
    </div>
  );
}

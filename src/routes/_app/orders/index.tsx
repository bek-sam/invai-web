import { CHANNELS, type Order } from "@invai/contracts";
import {
  Button,
  Input,
  Kbd,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Ban, Download, Loader2, Pause, Play, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { NativeSelect, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import {
  BulkCancelDialog,
  HoldDialog,
  useInvalidateOrders,
} from "../../../features/orders/dialogs";
import { downloadCsv, EXPORT_MAX_ROWS, ordersCsv } from "../../../features/orders/export";
import { OrderDetail } from "../../../features/orders/order-detail";
import { OrdersTable } from "../../../features/orders/orders-table";
import {
  nextActiveIndex,
  ORDER_VIEWS,
  type OrderView,
  tabCount,
  viewFilters,
} from "../../../features/orders/views";
import { useDebounced } from "../../../hooks/use-debounced";
import { errorMessage } from "../../../lib/errors";
import { endOfDayIso, startOfDayIso, toDateInput } from "../../../lib/format";
import { useCan, useMe } from "../../../lib/me";
import { client, orpc } from "../../../lib/rpc";

const searchSchema = z.object({
  view: z.enum(ORDER_VIEWS).optional().catch(undefined),
  // Coerced: the router parses "?q=3310000001" as a number, and an order-number search must survive.
  q: z.coerce.string().optional().catch(undefined),
  channel: z.enum(CHANNELS).optional().catch(undefined),
  personalized: z.boolean().optional().catch(undefined),
  /** Placed-on date range, YYYY-MM-DD (local days). */
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  tag: z.coerce.string().max(40).optional().catch(undefined),
  order: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/orders/")({
  validateSearch: searchSchema,
  component: OrdersPage,
});

function OrdersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/orders/" });
  const view: OrderView = search.view ?? "all";
  const [text, setText] = useState(search.q ?? "");
  const q = useDebounced(text.trim(), 250);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [holdOpen, setHoldOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tagText, setTagText] = useState(search.tag ?? "");
  const tag = useDebounced(tagText.trim(), 300);
  const me = useMe();
  const invalidate = useInvalidateOrders();

  const setSearch = useCallback(
    (patch: Partial<z.infer<typeof searchSchema>>) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
    [navigate],
  );

  useEffect(() => {
    if ((search.q ?? "") !== q) setSearch({ q: q || undefined });
  }, [q, search.q, setSearch]);
  useEffect(() => {
    if ((search.tag ?? "") !== tag) setSearch({ tag: tag || undefined });
  }, [tag, search.tag, setSearch]);

  const timeZone = me.org.timezone;
  /** Filters shared by the list, the tab counts and the export (everything but the tab). */
  const common = useMemo(
    () => ({
      search: q || undefined,
      channel: search.channel ? [search.channel] : undefined,
      hasPersonalization: search.personalized || undefined,
      placedFrom: search.from ? startOfDayIso(search.from) : undefined,
      placedTo: search.to ? endOfDayIso(search.to) : undefined,
      tag: search.tag || undefined,
    }),
    [q, search.channel, search.personalized, search.from, search.to, search.tag],
  );
  const filters = useMemo(
    () => ({ ...viewFilters(view, { timeZone }), ...common }),
    [view, common, timeZone],
  );
  const hasFilters = !!(
    search.channel ||
    search.personalized ||
    search.from ||
    search.to ||
    search.tag
  );

  const list = useInfiniteQuery(
    orpc.orders.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        ...filters,
        cursor,
        limit: 100,
        sort: "shipBy",
        dir: "asc",
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const counts = useQuery(orpc.orders.counts.queryOptions({ input: common, retry: false }));
  // The order rollup can't tell "needs mapping" from "needs artwork": count those by item state.
  const mappingCounts = useQuery(
    orpc.orders.counts.queryOptions({
      input: { ...common, itemState: ["needs_mapping"] },
      retry: false,
    }),
  );
  const artworkCounts = useQuery(
    orpc.orders.counts.queryOptions({
      input: { ...common, itemState: ["needs_artwork"] },
      retry: false,
    }),
  );
  const blockedCounts = useQuery(
    orpc.orders.counts.queryOptions({
      input: { ...common, itemState: ["needs_mapping", "needs_artwork"] },
      retry: false,
    }),
  );
  const orders: Order[] = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection whenever the filters change
  useEffect(() => {
    setSelected(new Set());
    setActiveIndex(-1);
  }, [filters]);

  const open = useCallback((o: Order) => setSearch({ order: o.id }), [setSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest("input, textarea, select, [contenteditable], [role=dialog]") ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const next = nextActiveIndex(e.key, activeIndex, orders.length);
      if (next !== null) {
        e.preventDefault();
        setActiveIndex(next);
        return;
      }
      const active = orders[activeIndex];
      if (e.key === "x" && active) {
        e.preventDefault();
        const s = new Set(selected);
        if (s.has(active.id)) s.delete(active.id);
        else s.add(active.id);
        setSelected(s);
      } else if ((e.key === "Enter" || e.key === "o") && active) {
        e.preventDefault();
        open(active);
      } else if (e.key === "Escape" && selected.size > 0) {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, orders, selected, open]);

  const release = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => client.orders.release({ id })));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === results.length) throw (results[0] as PromiseRejectedResult).reason;
      return { ok: results.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      toast.success(t("orders.releasedMany", "{{count}} order(s) released", { count: ok }), {
        description: failed
          ? t("orders.someFailed", "{{count}} failed", { count: failed })
          : undefined,
      });
      setSelected(new Set());
      void invalidate();
    },
  });

  const countFor = (v: OrderView) =>
    tabCount(v, counts.data, {
      needs_mapping: mappingCounts.data,
      needs_artwork: artworkCounts.data,
      blocked: blockedCounts.data,
    });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const rows: Order[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.orders.list({
          ...filters,
          cursor,
          limit: 200,
          sort: "shipBy",
          dir: "asc",
        });
        rows.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && rows.length < EXPORT_MAX_ROWS);
      const capped = rows.slice(0, EXPORT_MAX_ROWS);
      downloadCsv(`orders-${view}-${toDateInput(new Date())}.csv`, ordersCsv(capped));
      return { count: capped.length, more: !!cursor };
    },
    onSuccess: ({ count, more }) =>
      toast.success(t("orders.exported", "Exported {{count}} order(s)", { count }), {
        description: more
          ? t(
              "orders.exportCapped",
              "Only the first {{max}} are included. Narrow the filters to get the rest.",
              {
                max: EXPORT_MAX_ROWS,
              },
            )
          : undefined,
      }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const selectedIds = [...selected];
  const selectedOrders = orders.filter((o) => selected.has(o.id));
  return (
    <Page
      title={t("nav.orders")}
      description={
        <span className="hidden items-center gap-1 sm:inline-flex">
          {t("orders.shortcuts", "Sorted by ship-by.")} <Kbd>j</Kbd>/<Kbd>k</Kbd>{" "}
          {t("orders.move", "move")} · <Kbd>x</Kbd> {t("orders.selectKey", "select")} · <Kbd>↵</Kbd>{" "}
          {t("orders.openKey", "open")} · <Kbd>/</Kbd> {t("orders.searchKey", "search")}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <Tabs
          value={view}
          onValueChange={(v) => setSearch({ view: v === "all" ? undefined : (v as OrderView) })}
        >
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              {ORDER_VIEWS.map((v) => {
                const n = countFor(v);
                return (
                  <TabsTrigger key={v} value={v} className="gap-1.5">
                    {t(`orders.view.${v}`, v)}
                    {n !== undefined && n > 0 && (
                      <span className="text-xs tabular-nums text-muted-foreground">{n}</span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("orders.searchPlaceholder", "Order no, buyer, SKU…")}
              className="pl-8"
              aria-label={t("action.search")}
            />
          </div>
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
              aria-label={t("orders.placedFrom", "Placed from")}
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
              aria-label={t("orders.placedTo", "Placed to")}
            />
          </div>
          <Input
            className="w-32"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder={t("orders.tagFilter", "Tag")}
            aria-label={t("orders.tagFilterLabel", "Filter by tag")}
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={!!search.personalized}
              onCheckedChange={(v) => setSearch({ personalized: v || undefined })}
              aria-label={t("orders.personalized", "Personalized")}
            />
            {t("orders.personalized", "Personalized")}
          </label>
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTagText("");
                setSearch({
                  channel: undefined,
                  personalized: undefined,
                  from: undefined,
                  to: undefined,
                  tag: undefined,
                });
              }}
            >
              <X />
              {t("orders.clearFilters", "Clear filters")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending || orders.length === 0}
          >
            {exportCsv.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {t("orders.exportCsv", "Export CSV")}
          </Button>
          {selected.size > 0 && can("orders.manage") && (
            <div className="ml-auto flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm">
              <span className="tabular-nums">
                {t("orders.nSelected", "{{count}} selected", { count: selected.size })}
              </span>
              <Button size="sm" variant="outline" onClick={() => setHoldOpen(true)}>
                <Pause />
                {t("orders.hold", "Hold")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => release.mutate(selectedIds)}
                disabled={release.isPending}
              >
                <Play />
                {t("orders.release", "Release")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-danger"
                onClick={() => setCancelOpen(true)}
              >
                <Ban />
                {t("orders.cancel", "Cancel")}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => setSelected(new Set())}
                aria-label={t("action.close")}
              >
                <X />
              </Button>
            </div>
          )}
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <OrdersTable
            orders={orders}
            isLoading={list.isPending}
            hasMore={!!list.hasNextPage}
            isLoadingMore={list.isFetchingNextPage}
            onLoadMore={() => void list.fetchNextPage()}
            selected={selected}
            onSelectedChange={setSelected}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            onOpen={open}
            emptyTitle={t("orders.empty", "No orders in this view")}
          />
        )}
      </div>
      <HoldDialog
        orderIds={selectedIds}
        open={holdOpen}
        onOpenChange={setHoldOpen}
        onDone={() => setSelected(new Set())}
      />
      {cancelOpen && (
        <BulkCancelDialog
          orders={selectedOrders}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          onDone={() => setSelected(new Set())}
        />
      )}
      <Sheet open={!!search.order} onOpenChange={(o) => !o && setSearch({ order: undefined })}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("orders.detail", "Order detail")}</SheetTitle>
            <SheetDescription>
              {t("orders.detailHint", "Items, timeline and actions")}
            </SheetDescription>
          </SheetHeader>
          {search.order && <OrderDetail orderId={search.order} inDrawer />}
        </SheetContent>
      </Sheet>
    </Page>
  );
}

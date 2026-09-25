import {
  ADJUST_REASONS,
  type BlankVariant,
  type CountResult,
  MOVEMENT_KINDS,
  type Movement,
  type ReorderSuggestion,
  type StockLevel,
} from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  cn,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Money,
  Progress,
  RelativeTime,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardPlus,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Field, NativeSelect, Page } from "../../../components/page";
import { BlankPicker, blankLabel } from "../../../components/pickers";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { useDebounced } from "../../../hooks/use-debounced";
import { formatNumber, freightProgress } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

const TABS = ["stock", "movements", "reorder", "count"] as const;

export const Route = createFileRoute("/_app/inventory/stock")({
  validateSearch: z.object({
    low: z.boolean().optional().catch(undefined),
    tab: z.enum(TABS).optional().catch(undefined),
  }),
  component: StockPage,
});

function StockPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/inventory/stock" });
  const tab = search.tab ?? "stock";
  return (
    <Page
      title={t("nav.stock")}
      description={t(
        "stock.subtitle",
        "Blank stock by style, color and size, from the movement ledger.",
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(v) =>
          void navigate({
            search: (p) => ({ ...p, tab: v as (typeof TABS)[number] }),
            replace: true,
          })
        }
      >
        <TabsList className="mb-3">
          <TabsTrigger value="stock">{t("stock.levels", "Stock levels")}</TabsTrigger>
          <TabsTrigger value="movements">{t("stock.movements", "Movements")}</TabsTrigger>
          {can("purchasing.read") && (
            <TabsTrigger value="reorder">{t("stock.reorder", "Reorder")}</TabsTrigger>
          )}
          {can("inventory.count") && (
            <TabsTrigger value="count">{t("stock.count", "Count")}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="stock">
          <StockLevels
            low={!!search.low}
            onLowChange={(v) =>
              void navigate({ search: (p) => ({ ...p, low: v || undefined }), replace: true })
            }
          />
        </TabsContent>
        <TabsContent value="movements">
          <Movements />
        </TabsContent>
        <TabsContent value="reorder">
          <Reorder />
        </TabsContent>
        <TabsContent value="count">
          <CycleCount />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function StockLevels({ low, onLowChange }: { low: boolean; onLowChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const [adjusting, setAdjusting] = useState<StockLevel | null>(null);
  const stock = useInfiniteQuery(
    orpc.inventory.stock.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        search: q || undefined,
        belowReorderPoint: low || undefined,
        cursor,
        limit: 200,
        sort: "style",
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => stock.data?.pages.flatMap((p) => p.items) ?? [], [stock.data]);
  const lowCount = stock.data?.pages[0]?.lowStockCount;
  const num = (n: number, cls?: string) => (
    <span className={cn("tabular-nums", cls)}>{formatNumber(n)}</span>
  );
  const columns: DataTableColumn<StockLevel>[] = [
    {
      id: "blank",
      header: t("orders.blank", "Blank"),
      accessorFn: (r) => blankLabel(r.blank),
      cell: ({ row }) => (
        <span className={cn(row.original.belowReorderPoint && "font-medium text-danger")}>
          {blankLabel(row.original.blank)}
          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
            {row.original.blank.supplierSku}
          </span>
        </span>
      ),
    },
    {
      accessorKey: "available",
      header: t("stock.available", "Available"),
      cell: ({ row }) =>
        num(
          row.original.available,
          row.original.belowReorderPoint ? "text-danger font-semibold" : "font-semibold",
        ),
    },
    {
      accessorKey: "onHand",
      header: t("stock.onHand", "On hand"),
      cell: ({ row }) => num(row.original.onHand),
    },
    {
      accessorKey: "reserved",
      header: t("stock.reserved", "Reserved"),
      cell: ({ row }) => num(row.original.reserved, "text-muted-foreground"),
    },
    {
      accessorKey: "incoming",
      header: t("stock.incoming", "Incoming"),
      cell: ({ row }) => num(row.original.incoming, "text-info"),
    },
    {
      accessorKey: "reorderPoint",
      header: t("stock.reorderPoint", "Reorder at"),
      cell: ({ row }) =>
        row.original.reorderPoint === null ? "—" : num(row.original.reorderPoint),
    },
    {
      accessorKey: "daysOfCover",
      header: t("stock.cover", "Days of cover"),
      cell: ({ row }) => {
        const d = row.original.daysOfCover;
        return d === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn("tabular-nums", d < 7 && "text-warning", d < 3 && "text-danger")}>
            {d.toFixed(1)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        can("inventory.adjust") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setAdjusting(row.original);
            }}
          >
            <SlidersHorizontal />
            {t("stock.adjust", "Adjust")}
          </Button>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("blanks.search", "Search style, color, SKU")}
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={low} onCheckedChange={onLowChange} />
          {t("stock.lowOnly", "Below reorder point")}
          {lowCount !== undefined && lowCount > 0 && <Badge variant="danger">{lowCount}</Badge>}
        </label>
      </div>
      {stock.isError ? (
        <ErrorState error={stock.error} onRetry={() => void stock.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<StockLevel, unknown>[]}
          data={rows}
          getRowId={(r) => `${r.blankVariantId}-${r.locationId}`}
          isLoading={stock.isPending}
          hasMore={!!stock.hasNextPage}
          isLoadingMore={stock.isFetchingNextPage}
          onLoadMore={() => void stock.fetchNextPage()}
          emptyTitle={
            low
              ? t("stock.noLow", "Nothing below its reorder point")
              : t("stock.empty", "No stock yet")
          }
          maxHeight="calc(100dvh - 17rem)"
          estimateRowHeightPx={45}
        />
      )}
      {adjusting && <AdjustDialog level={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function AdjustDialog({ level, onClose }: { level: StockLevel; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<(typeof ADJUST_REASONS)[number]>("correction");
  const [note, setNote] = useState("");
  const [reorderPoint, setReorderPoint] = useState(
    level.reorderPoint === null ? "" : String(level.reorderPoint),
  );
  const [reorderQty, setReorderQty] = useState(
    level.reorderQty === null ? "" : String(level.reorderQty),
  );
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.inventory.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.today.key() });
  };
  const adjust = useMutation(orpc.inventory.adjust.mutationOptions({ onSuccess: invalidate }));
  const setRp = useMutation(
    orpc.inventory.stock.setReorderPoint.mutationOptions({ onSuccess: invalidate }),
  );
  const n = Number.parseInt(qty, 10);
  const rpChanged =
    reorderPoint !== (level.reorderPoint === null ? "" : String(level.reorderPoint)) ||
    reorderQty !== (level.reorderQty === null ? "" : String(level.reorderQty));
  async function save() {
    if (qty && n !== 0) {
      await adjust.mutateAsync({
        blankVariantId: level.blankVariantId,
        locationId: level.locationId,
        qty: n,
        reason,
        note: note.trim() || null,
      });
    }
    if (rpChanged) {
      await setRp.mutateAsync({
        blankVariantId: level.blankVariantId,
        locationId: level.locationId,
        reorderPoint: reorderPoint ? Number(reorderPoint) : null,
        reorderQty: reorderQty ? Number(reorderQty) : null,
      });
    }
    toast.success(t("stock.adjusted", "Stock updated"));
    onClose();
  }
  const pending = adjust.isPending || setRp.isPending;
  const qtyValid = !qty || (Number.isInteger(n) && n !== 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("stock.adjustTitle", "Adjust stock")}</DialogTitle>
          <DialogDescription>
            {blankLabel(level.blank)} ·{" "}
            {t("stock.availableNow", "{{n}} available now", { n: level.available })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("stock.qtyChange", "Change (+/-)")}
            htmlFor="adj-qty"
            error={qtyValid ? undefined : t("stock.qtyInvalid", "Whole number, not zero")}
          >
            <Input
              id="adj-qty"
              inputMode="numeric"
              value={qty}
              placeholder="-3"
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <Field label={t("orders.reason", "Reason")} htmlFor="adj-reason">
            <NativeSelect
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
            >
              {ADJUST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`adjustReason.${r}`, r)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("orders.note", "Note")} htmlFor="adj-note" className="col-span-2">
            <Textarea
              id="adj-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Field
            label={t("stock.reorderPoint", "Reorder at")}
            htmlFor="adj-rp"
            hint={t("stock.rpHint", "Empty = automatic from velocity")}
          >
            <Input
              id="adj-rp"
              inputMode="numeric"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
            />
          </Field>
          <Field label={t("stock.reorderQty", "Reorder qty")} htmlFor="adj-rq">
            <Input
              id="adj-rq"
              inputMode="numeric"
              value={reorderQty}
              onChange={(e) => setReorderQty(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => void save().catch(() => undefined)}
            disabled={pending || !qtyValid || (!qty && !rpChanged)}
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Movements() {
  const { t } = useTranslation();
  const [kind, setKind] = useState("");
  const q = useInfiniteQuery(
    orpc.inventory.movements.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        kind: kind ? [kind as never] : undefined,
        cursor,
        limit: 200,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const columns: DataTableColumn<Movement>[] = [
    {
      accessorKey: "at",
      header: t("stock.when", "When"),
      cell: ({ row }) => <RelativeTime value={row.original.at} className="text-muted-foreground" />,
    },
    {
      accessorKey: "kind",
      header: t("stock.kind", "Kind"),
      cell: ({ row }) => (
        <Badge variant="secondary">
          {t(`movementKind.${row.original.kind}`, row.original.kind)}
        </Badge>
      ),
    },
    { id: "blank", header: t("orders.blank", "Blank"), accessorFn: (r) => blankLabel(r.blank) },
    {
      accessorKey: "qty",
      header: t("stock.qty", "Qty"),
      cell: ({ row }) => (
        <span
          className={cn(
            "tabular-nums font-medium",
            row.original.qty > 0 ? "text-success" : row.original.qty < 0 ? "text-danger" : "",
          )}
        >
          {row.original.qty > 0 ? "+" : ""}
          {row.original.qty}
        </span>
      ),
    },
    {
      id: "reason",
      header: t("orders.reason", "Reason"),
      cell: ({ row }) =>
        [
          row.original.reason && t(`adjustReason.${row.original.reason}`, row.original.reason),
          row.original.note,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    { id: "actor", header: t("stock.by", "By"), cell: ({ row }) => row.original.actor.name },
  ];
  return (
    <div className="flex flex-col gap-3">
      <NativeSelect
        className="w-fit"
        aria-label={t("stock.kind", "Kind")}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        <option value="">{t("stock.allKinds", "All movements")}</option>
        {MOVEMENT_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`movementKind.${k}`, k)}
          </option>
        ))}
      </NativeSelect>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<Movement, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={q.isPending}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          emptyTitle={t("stock.noMovements", "No movements yet")}
          maxHeight="calc(100dvh - 17rem)"
        />
      )}
    </div>
  );
}

function Reorder() {
  const { t } = useTranslation();
  const q = useQuery(orpc.inventory.reorderSuggestions.queryOptions({ input: {} }));
  if (q.isPending) return <SkeletonRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title={t("stock.noReorder", "Nothing to reorder")}
          description={t("stock.noReorderHint", "Every blank has enough cover.")}
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {q.data.items.map((s) => (
        <SupplierSuggestion key={s.supplier} suggestion={s} />
      ))}
    </div>
  );
}

function SupplierSuggestion({ suggestion: s }: { suggestion: ReorderSuggestion }) {
  const { t } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(s.lines.map((l) => [l.blankVariantId, l.suggestedQty])),
  );
  const subtotal = s.lines.reduce((sum, l) => sum + (qty[l.blankVariantId] ?? 0) * l.unitCost, 0);
  const { ratio, shortfall } = freightProgress(subtotal, s.freeFreightThreshold);
  const create = useMutation(
    orpc.inventory.createPoFromSuggestion.mutationOptions({
      onSuccess: (po) => {
        toast.success(t("stock.poCreated", "Draft PO {{no}} created", { no: po.poNo }));
        void queryClient.invalidateQueries({ queryKey: orpc.inventory.key() });
        void navigate({ to: "/inventory/purchase-orders/$poId", params: { poId: po.id } });
      },
    }),
  );
  const lines = s.lines
    .filter((l) => (qty[l.blankVariantId] ?? 0) > 0)
    .map((l) => ({ blankVariantId: l.blankVariantId, qty: qty[l.blankVariantId] ?? 0 }));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <p className="font-semibold">{s.supplierName}</p>
          <p className="text-sm text-muted-foreground">
            {t("stock.nLines", "{{count}} blanks", { count: s.lines.length })}
          </p>
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-1 flex justify-between text-xs">
            <span>
              <Money cents={subtotal} /> / <Money cents={s.freeFreightThreshold} />{" "}
              {t("stock.freeFreight", "free freight")}
            </span>
            <span className={shortfall === 0 ? "text-success" : "text-muted-foreground"}>
              {shortfall === 0
                ? t("stock.freightMet", "Free freight reached")
                : t("stock.shortfall", "{{amount}} to go", {
                    amount: `$${(shortfall / 100).toFixed(2)}`,
                  })}
            </span>
          </div>
          <Progress value={ratio * 100} className={cn(shortfall === 0 && "[&>div]:bg-success")} />
        </div>
        {can("purchasing.manage") && (
          <Button
            onClick={() => create.mutate({ supplier: s.supplier, lines })}
            disabled={lines.length === 0 || create.isPending}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <ClipboardPlus />}
            {t("stock.createPo", "Create PO")}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{t("orders.blank", "Blank")}</th>
              <th className="px-2 py-2 text-right font-medium">
                {t("stock.available", "Available")}
              </th>
              <th className="px-2 py-2 text-right font-medium">
                {t("stock.cover", "Days of cover")}
              </th>
              <th className="px-2 py-2 text-left font-medium">{t("orders.reason", "Reason")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("stock.qty", "Qty")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("stock.lineCost", "Cost")}</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.blankVariantId} className="border-t border-border">
                <td className="px-4 py-1.5">
                  {blankLabel(l.blank)}
                  {l.supplierStock !== null && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({t("stock.atSupplier", "{{n}} at supplier", { n: l.supplierStock })})
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.available}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {l.daysOfCover === null ? "—" : l.daysOfCover.toFixed(1)}
                </td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t(`reorderReason.${l.reason}`, l.reason.replace(/_/g, " "))}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    type="number"
                    min={0}
                    className="ml-auto h-8 w-20 text-right"
                    value={qty[l.blankVariantId] ?? 0}
                    onChange={(e) =>
                      setQty({
                        ...qty,
                        [l.blankVariantId]: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                      })
                    }
                    aria-label={t("stock.qty", "Qty")}
                  />
                </td>
                <td className="px-4 py-1.5 text-right">
                  <Money cents={(qty[l.blankVariantId] ?? 0) * l.unitCost} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type CountLine = {
  blankVariantId: string;
  blank: { brand: string; style: string; color: string; size: string };
  counted: string;
};

/** T-6-1 AC4: pick a location or bin, enter counts, preview the difference, submit. */
function CycleCount() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const locations = useQuery(orpc.locations.list.queryOptions({ input: {} }));
  const [locationId, setLocationId] = useState("");
  const [picked, setPicked] = useState<BlankVariant | null>(null);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CountResult | null>(null);

  function addLine() {
    if (!picked || lines.some((l) => l.blankVariantId === picked.id)) return;
    setLines([
      ...lines,
      {
        blankVariantId: picked.id,
        blank: { brand: picked.brand, style: picked.style, color: picked.color, size: picked.size },
        counted: "0",
      },
    ]);
    setPicked(null);
  }
  function setLine(id: string, counted: string) {
    setLines(lines.map((l) => (l.blankVariantId === id ? { ...l, counted } : l)));
  }
  function removeLine(id: string) {
    setLines(lines.filter((l) => l.blankVariantId !== id));
  }

  const payloadLines = lines.map((l) => ({
    blankVariantId: l.blankVariantId,
    counted: Number.parseInt(l.counted, 10),
  }));
  const valid =
    payloadLines.length > 0 &&
    payloadLines.every((l) => Number.isInteger(l.counted) && l.counted >= 0);

  const submit = useMutation(
    orpc.inventory.count.mutationOptions({
      onSuccess: (res) => {
        toast.success(t("stock.countSubmitted", "Count submitted"));
        setResult(res);
        setLines([]);
        setNote("");
        void queryClient.invalidateQueries({ queryKey: orpc.inventory.key() });
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("stock.location", "Location")} htmlFor="count-location">
            <NativeSelect
              id="count-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={locations.isPending}
            >
              <option value="">{t("stock.defaultLocation", "Default location")}</option>
              {locations.data?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label={t("stock.addToCount", "Add a blank to count")}>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <BlankPicker value={picked} onChange={setPicked} />
            </div>
            <Button type="button" variant="outline" onClick={addLine} disabled={!picked}>
              <Plus />
              {t("action.add", "Add")}
            </Button>
          </div>
        </Field>
      </Card>
      {lines.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("orders.blank", "Blank")}</th>
                  <th className="px-2 py-2 text-right font-medium">
                    {t("stock.expected", "Expected")}
                  </th>
                  <th className="px-2 py-2 text-right font-medium">
                    {t("stock.counted", "Counted")}
                  </th>
                  <th className="px-2 py-2 text-right font-medium">
                    {t("stock.difference", "Difference")}
                  </th>
                  <th className="w-8">
                    <span className="sr-only">{t("action.delete")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <CountLineRow
                    key={l.blankVariantId}
                    line={l}
                    locationId={locationId || undefined}
                    onChange={(v) => setLine(l.blankVariantId, v)}
                    onRemove={() => removeLine(l.blankVariantId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border p-4">
            <Field label={t("orders.note", "Note")} htmlFor="count-note">
              <Textarea
                id="count-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  submit.mutate({
                    locationId: locationId || undefined,
                    lines: payloadLines,
                    note: note.trim() || null,
                  })
                }
                disabled={!valid || submit.isPending}
              >
                {submit.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
                {t("stock.submitCount", "Submit count")}
              </Button>
            </div>
          </div>
        </Card>
      )}
      {lines.length === 0 && !result && (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title={t("stock.countEmpty", "Nothing added yet")}
            description={t("stock.countEmptyHint", "Search for a blank above to start a count.")}
          />
        </Card>
      )}
      {result && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">{t("stock.lastCount", "Last count")}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {result.variance.map((v) => (
              <li key={v.blankVariantId} className="flex justify-between gap-3 tabular-nums">
                <span className="text-muted-foreground">
                  {t("stock.countLine", "expected {{expected}}, counted {{counted}}", {
                    expected: v.expected,
                    counted: v.counted,
                  })}
                </span>
                <span
                  className={cn(
                    "font-medium",
                    v.delta > 0 && "text-success",
                    v.delta < 0 && "text-danger",
                  )}
                >
                  {v.delta > 0 ? "+" : ""}
                  {v.delta}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CountLineRow({
  line,
  locationId,
  onChange,
  onRemove,
}: {
  line: CountLine;
  locationId: string | undefined;
  onChange: (counted: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const expected = useQuery(
    orpc.inventory.stock.get.queryOptions({
      input: { blankVariantId: line.blankVariantId, locationId },
    }),
  );
  const onHand = expected.data?.onHand ?? null;
  const counted = Number.parseInt(line.counted, 10);
  const delta = onHand === null || !Number.isInteger(counted) ? null : counted - onHand;
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-1.5">{blankLabel(line.blank)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {expected.isPending ? "…" : (onHand ?? "—")}
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          min={0}
          className="ml-auto h-8 w-20 text-right"
          value={line.counted}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("stock.counted", "Counted")}
        />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {delta === null ? (
          "—"
        ) : (
          <span className={cn(delta > 0 && "text-success", delta < 0 && "text-danger")}>
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-danger"
          onClick={onRemove}
          aria-label={t("action.delete")}
        >
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}

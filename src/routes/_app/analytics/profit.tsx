import { type Channel, PROFIT_DIMENSIONS, type ProfitRow } from "@invai/contracts";
import {
  Button,
  Card,
  cn,
  DataTable,
  type DataTableColumn,
  Money,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Info, Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { OrderProfitBreakdown } from "../../../features/finance/order-profit";
import { errorMessage } from "../../../lib/errors";
import {
  formatDay,
  formatMoneyShort,
  formatPct,
  lastNDays,
  toDateInput,
} from "../../../lib/format";
import { client, orpc } from "../../../lib/rpc";

const PERIODS = [7, 30, 90] as const;

export const Route = createFileRoute("/_app/analytics/profit")({
  validateSearch: z.object({
    dim: z.enum(PROFIT_DIMENSIONS).optional().catch(undefined),
    days: z.coerce.number().optional().catch(undefined),
    order: z.string().optional().catch(undefined),
  }),
  component: ProfitPage,
});

function ProfitPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/analytics/profit" });
  const dim = search.dim ?? "design";
  const days = PERIODS.includes(search.days as never) ? (search.days as number) : 30;
  // Stable period for the query key: rounded to the minute.
  const period = useMemo(
    () => lastNDays(days, new Date(Math.floor(Date.now() / 60_000) * 60_000)),
    [days],
  );
  const queryClient = useQueryClient();
  const [recomputeStartedAt, setRecomputeStartedAt] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const q = useQuery(
    orpc.finance.profit.queryOptions({
      input: { dimension: dim, period, sort: dim === "day" ? "key" : "net", limit: 200 },
      refetchInterval: () =>
        recomputeStartedAt && Date.now() - recomputeStartedAt < 20_000 ? 2000 : false,
    }),
  );
  const recompute = useMutation(
    orpc.finance.recompute.mutationOptions({
      onSuccess: () => {
        setRecomputeStartedAt(Date.now());
        toast.success(t("profit.recomputeStarted", "Profit is being recomputed"));
        void queryClient.invalidateQueries({ queryKey: orpc.finance.profit.key() });
      },
      onError: (err) => toast.error(errorMessage(err)),
    }),
  );
  async function exportCsv() {
    setExporting(true);
    try {
      const { key } = await client.finance.exportCsv({ dimension: dim, period });
      const { url } = await client.files.downloadUrl({ fileKey: key, disposition: "attachment" });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }
  const label = (r: ProfitRow) => (dim === "day" ? formatDay(r.key) : r.label);
  /** Orders-list filters this row's dimension actually supports (contract has no design/blank
   * filter yet on `orders.list`, so those two dims can only pre-filter by period). */
  const ordersSearchFor = (r: ProfitRow) => {
    const from = toDateInput(new Date(period.from));
    const to = toDateInput(new Date(period.to));
    if (dim === "day") return { from: r.key, to: r.key };
    if (dim === "channel") return { channel: r.key as Channel, from, to };
    return { from, to };
  };
  const chartRows = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const list =
      dim === "day" ? [...rows].sort((a, b) => a.key.localeCompare(b.key)) : rows.slice(0, 15);
    return list.map((r) => ({ name: label(r), net: r.net / 100, revenue: r.revenue / 100 }));
    // biome-ignore lint/correctness/useExhaustiveDependencies: label depends only on dim
  }, [q.data, dim, label]);

  const columns: DataTableColumn<ProfitRow>[] = [
    {
      id: "label",
      header: t(`profit.dim.${dim}`, dim),
      accessorFn: label,
      cell: ({ row }) => <span className="font-medium">{label(row.original)}</span>,
    },
    { accessorKey: "orders", header: t("profit.orders", "Orders") },
    { accessorKey: "units", header: t("profit.units", "Units") },
    {
      accessorKey: "revenue",
      header: t("profit.revenue", "Revenue"),
      cell: ({ row }) => <Money cents={row.original.revenue} />,
    },
    {
      accessorKey: "channelFees",
      header: t("profit.channelFees", "Channel fees"),
      cell: ({ row }) => <Money cents={-row.original.channelFees} />,
    },
    {
      accessorKey: "blankCost",
      header: t("profit.blankCost", "Blanks"),
      cell: ({ row }) => <Money cents={-row.original.blankCost} />,
    },
    {
      accessorKey: "transferCost",
      header: t("profit.transferCost", "Transfers"),
      cell: ({ row }) => <Money cents={-row.original.transferCost} />,
    },
    {
      accessorKey: "labelCost",
      header: t("profit.labelCost", "Label"),
      cell: ({ row }) => <Money cents={-row.original.labelCost} />,
    },
    {
      id: "other",
      header: t("profit.other", "Other"),
      accessorFn: (r) => r.packagingCost + r.laborCost + r.adsCost + r.refunds,
      cell: ({ row }) => (
        <Money
          cents={
            -(
              row.original.packagingCost +
              row.original.laborCost +
              row.original.adsCost +
              row.original.refunds
            )
          }
        />
      ),
    },
    {
      accessorKey: "net",
      header: t("profit.net", "Net"),
      cell: ({ row }) => <Money cents={row.original.net} className="font-semibold" />,
    },
    {
      accessorKey: "marginPct",
      header: t("profit.margin", "Margin"),
      cell: ({ row }) => (
        <span
          className={cn(
            "tabular-nums",
            (row.original.marginPct ?? 0) < 0.15 && "text-warning",
            (row.original.marginPct ?? 0) < 0 && "text-danger",
          )}
        >
          {formatPct(row.original.marginPct)}
        </span>
      ),
    },
  ];

  const totals = q.data?.totals;
  return (
    <Page
      title={t("nav.profit")}
      description={t(
        "profit.subtitle",
        "True profit after fees, blanks, transfers, labels, packaging, labor, ads and refunds.",
      )}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/analytics/ad-spend"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("profit.manageAdSpend", "Manage ad spend")}
          </Link>
          <NativeSelect
            aria-label={t("profit.period", "Period")}
            value={days}
            onChange={(e) =>
              void navigate({
                search: (p) => ({ ...p, days: Number(e.target.value) }),
                replace: true,
              })
            }
          >
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                {t("profit.lastDays", "Last {{n}} days", { n: d })}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            disabled={recompute.isPending}
            onClick={() => recompute.mutate({ period })}
          >
            {recompute.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("profit.recompute", "Recompute")}
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportCsv()}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {t("profit.export", "Export CSV")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs
          value={dim}
          onValueChange={(v) =>
            void navigate({ search: (p) => ({ ...p, dim: v as typeof dim }), replace: true })
          }
        >
          <TabsList>
            {(["design", "channel", "blank", "day", "order"] as const).map((d) => (
              <TabsTrigger key={d} value={d}>
                {t(`profit.by.${d}`, `By ${d}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {totals
                ? [
                    [t("profit.revenue", "Revenue"), totals.revenue],
                    [t("profit.costs", "Costs"), -(totals.revenue - totals.net)],
                    [t("profit.channelFees", "Channel fees"), -totals.channelFees],
                    [t("profit.netProfit", "Net profit"), totals.net],
                  ].map(([l, v]) => (
                    <Card key={l as string} className="p-4">
                      <p className="text-sm text-muted-foreground">{l}</p>
                      <p className="mt-1 text-2xl font-semibold">
                        <Money cents={v as number} />
                      </p>
                    </Card>
                  ))
                : ["a", "b", "c", "d"].map((k) => <Skeleton key={k} className="h-[88px]" />)}
              {totals ? (
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">{t("profit.margin", "Margin")}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatPct(totals.marginPct, 1)}
                  </p>
                </Card>
              ) : (
                <Skeleton className="h-[88px]" />
              )}
            </div>
            {q.data?.incomplete && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="size-4" />
                {t(
                  "profit.incomplete",
                  "Some orders have no fee data yet; their fees are estimated.",
                )}
              </p>
            )}
            {dim !== "order" && (
              <Section
                title={
                  dim === "day"
                    ? t("profit.netByDay", "Net profit by day")
                    : t("profit.top", "Net profit, top 15")
                }
              >
                {q.isPending ? (
                  <Skeleton className="h-72" />
                ) : chartRows.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    {t("profit.noData", "No orders in this period")}
                  </p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartRows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <CartesianGrid vertical={false} stroke="var(--color-border)" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                          interval="preserveStartEnd"
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={(v: number) => formatMoneyShort(v)}
                          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          width={56}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--color-muted)" }}
                          contentStyle={{
                            background: "var(--color-popover)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v) => `$${Number(v).toFixed(2)}`}
                        />
                        <Bar
                          dataKey="net"
                          name={t("profit.net", "Net")}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={36}
                        >
                          {chartRows.map((r) => (
                            <Cell
                              key={r.name}
                              fill={r.net < 0 ? "var(--color-danger)" : "var(--color-primary)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Section>
            )}
            {(dim === "design" || dim === "blank") && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="size-4" />
                {t(
                  "profit.drilldownLimited",
                  "Rows open the orders list for this period; the orders list can't filter by {{dim}} yet.",
                  { dim: t(`profit.dim.${dim}`).toLowerCase() },
                )}
              </p>
            )}
            <DataTable
              columns={columns as DataTableColumn<ProfitRow, unknown>[]}
              data={q.data?.rows ?? []}
              getRowId={(r) => r.key}
              isLoading={q.isPending}
              onRowClick={(r) =>
                dim === "order"
                  ? void navigate({ search: (p) => ({ ...p, order: r.key }) })
                  : void navigate({ to: "/orders", search: ordersSearchFor(r) })
              }
              emptyTitle={t("profit.noData", "No orders in this period")}
              maxHeight="32rem"
            />
          </>
        )}
      </div>
      <Sheet
        open={!!search.order}
        onOpenChange={(o) => !o && void navigate({ search: (p) => ({ ...p, order: undefined }) })}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("profit.orderBreakdown", "Order profit")}</SheetTitle>
            <SheetDescription>
              {t("profit.orderBreakdownHint", "Every cost line; estimates are marked.")}
            </SheetDescription>
          </SheetHeader>
          {search.order && (
            <div className="mt-4">
              <OrderProfitBreakdown orderId={search.order} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Page>
  );
}

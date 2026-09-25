import { REPRINT_REASONS, type Reprint } from "@invai/contracts";
import {
  Badge,
  Button,
  DataTable,
  type DataTableColumn,
  RelativeTime,
  Skeleton,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { z } from "zod";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Field, NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { formatDay, lastNDays } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

const PERIODS = [7, 30, 90] as const;
const STATUSES = ["requested", "on_sheet", "done", "cancelled"] as const;

export const Route = createFileRoute("/_app/production/reprints")({
  validateSearch: z.object({
    status: z.enum(STATUSES).optional().catch(undefined),
    reason: z.enum(REPRINT_REASONS).optional().catch(undefined),
    days: z.coerce.number().optional().catch(undefined),
  }),
  component: ReprintsPage,
});

function ReprintsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigateReprints();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState<Reprint | null>(null);

  const days = PERIODS.includes(search.days as never) ? (search.days as number) : 30;
  const period = useMemo(
    () => lastNDays(days, new Date(Math.floor(Date.now() / 60_000) * 60_000)),
    [days],
  );

  const chart = useQuery(orpc.production.reprints.reasonsByWeek.queryOptions({ input: period }));
  const totalRows = useMemo(
    () => (chart.data?.weeks ?? []).map((w) => ({ name: formatDay(w.weekStart), total: w.total })),
    [chart.data],
  );
  const reasonRows = useMemo(() => {
    const rows: { weekStart: string; reason: string; count: number }[] = [];
    for (const w of chart.data?.weeks ?? []) {
      for (const [reason, count] of Object.entries(w.byReason)) {
        if (count) rows.push({ weekStart: w.weekStart, reason, count });
      }
    }
    return rows.sort((a, b) =>
      a.weekStart === b.weekStart ? b.count - a.count : a.weekStart < b.weekStart ? 1 : -1,
    );
  }, [chart.data]);

  const list = useInfiniteQuery(
    orpc.production.reprints.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        status: search.status ? [search.status] : undefined,
        reason: search.reason,
        from: period.from,
        to: period.to,
        cursor,
        limit: 50,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const cancel = useMutation(
    orpc.production.reprints.cancel.mutationOptions({
      onSuccess: () => {
        toast.success(t("reprints.cancelledToast", "Reprint cancelled"));
        setCancelling(null);
        void queryClient.invalidateQueries({ queryKey: orpc.production.reprints.key() });
      },
      onError: () => setCancelling(null),
    }),
  );

  const columns: DataTableColumn<Reprint>[] = [
    {
      accessorKey: "orderNo",
      header: t("reprints.order", "Order"),
      cell: ({ row }) => <span className="font-medium">{row.original.orderNo}</span>,
    },
    {
      accessorKey: "reason",
      header: t("reprints.reason", "Reason"),
      cell: ({ row }) => t(`reprintReason.${row.original.reason}`, row.original.reason),
    },
    {
      accessorKey: "note",
      header: t("reprints.note", "Note"),
      cell: ({ row }) => row.original.note ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "status",
      header: t("reprints.status", "Status"),
      cell: ({ row }) => (
        <Badge variant={row.original.status === "cancelled" ? "outline" : "secondary"}>
          {t(`reprintStatus.${row.original.status}`, row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "requestedAt",
      header: t("reprints.requestedAt", "Requested"),
      cell: ({ row }) => <RelativeTime value={row.original.requestedAt} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        can("production.qc") && row.original.status === "requested" ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={(e) => {
              e.stopPropagation();
              setCancelling(row.original);
            }}
          >
            <X className="size-4" />
            {t("reprints.cancel", "Cancel")}
          </Button>
        ) : null,
    },
  ];

  return (
    <Page
      title={t("nav.reprints", "Reprints")}
      description={t(
        "reprints.subtitle",
        "Reprints requested from QC, with cancel and a reasons report.",
      )}
      actions={
        <NativeSelect
          aria-label={t("profit.period", "Period")}
          value={days}
          onChange={(e) => void navigate({ days: Number(e.target.value) })}
        >
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              {t("profit.lastDays", "Last {{n}} days", { n: d })}
            </option>
          ))}
        </NativeSelect>
      }
    >
      <div className="flex flex-col gap-4">
        <Section title={t("reprints.totalByWeek", "Total reprints by week")}>
          {chart.isPending ? (
            <Skeleton className="h-56" />
          ) : totalRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("reprints.chartEmpty", "No reprints in this period")}
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalRows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="total"
                    name={t("reprints.count", "Count")}
                    fill="var(--color-primary)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {reasonRows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {t("reprints.reasonsByWeek", "Reasons by week")}
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">{t("reprints.week", "Week")}</th>
                    <th className="py-1.5 pr-4 font-medium">{t("reprints.reason", "Reason")}</th>
                    <th className="py-1.5 text-right font-medium">
                      {t("reprints.count", "Count")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reasonRows.map((r) => (
                    <tr key={`${r.weekStart}-${r.reason}`} className="border-b border-border/50">
                      <td className="py-1.5 pr-4">{formatDay(r.weekStart)}</td>
                      <td className="py-1.5 pr-4">{t(`reprintReason.${r.reason}`, r.reason)}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section title={t("reprints.filters", "Filters")}>
          <div className="flex flex-wrap gap-3">
            <Field label={t("reprints.status", "Status")} htmlFor="reprint-status">
              <NativeSelect
                id="reprint-status"
                value={search.status ?? ""}
                onChange={(e) =>
                  void navigate({ status: (e.target.value || undefined) as typeof search.status })
                }
              >
                <option value="">{t("reprints.all", "All")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`reprintStatus.${s}`, s)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("reprints.reason", "Reason")} htmlFor="reprint-reason">
              <NativeSelect
                id="reprint-reason"
                value={search.reason ?? ""}
                onChange={(e) =>
                  void navigate({ reason: (e.target.value || undefined) as typeof search.reason })
                }
              >
                <option value="">{t("reprints.all", "All")}</option>
                {REPRINT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`reprintReason.${r}`, r)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </Section>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            isLoading={list.isPending}
            hasMore={!!list.hasNextPage}
            isLoadingMore={list.isFetchingNextPage}
            onLoadMore={() => void list.fetchNextPage()}
            emptyTitle={t("reprints.empty", "No reprints")}
            emptyDescription={t(
              "reprints.emptyHint",
              "Reprints requested from QC or the floor show up here.",
            )}
            maxHeight="calc(100dvh - 16rem)"
          />
        )}
      </div>
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={t("reprints.cancelTitle", "Cancel this reprint?")}
        description={t(
          "reprints.cancelHint",
          "The item stays as it is; request a new reprint if it still needs one.",
        )}
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate({ id: cancelling.id })}
      />
    </Page>
  );
}

function useNavigateReprints() {
  const navigate = Route.useNavigate();
  return (patch: Partial<ReturnType<typeof Route.useSearch>>) =>
    navigate({ search: (p) => ({ ...p, ...patch }), replace: true });
}

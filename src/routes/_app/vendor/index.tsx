import type { SheetState, VendorInboxSheet } from "@invai/contracts";
import {
  DataTable,
  type DataTableColumn,
  Money,
  RelativeTime,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@invai/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { SheetStatusBadge } from "../../../components/badges";
import { NativeSelect, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { formatInches } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";

const TABS = {
  new: ["sent"],
  in_progress: ["acknowledged", "printed"],
  shipped: ["shipped", "received"],
  all: [],
} as const satisfies Record<string, readonly SheetState[]>;
type Tab = keyof typeof TABS;

export const Route = createFileRoute("/_app/vendor/")({
  validateSearch: z.object({
    tab: z.enum(["new", "in_progress", "shipped", "all"]).optional().catch(undefined),
    shop: z.string().optional().catch(undefined),
  }),
  component: VendorInbox,
});

function VendorInbox() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const tab: Tab = search.tab ?? "new";
  const statuses = TABS[tab] as readonly SheetState[];
  const shops = useQuery(orpc.vendorPortal.shops.queryOptions({ input: {}, retry: false }));
  const q = useInfiniteQuery(
    orpc.vendorPortal.inbox.infiniteOptions({
      input: (cursor: string | undefined) => ({
        status: statuses.length ? [...statuses] : undefined,
        shopOrgId: search.shop,
        cursor,
        limit: 100,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      refetchInterval: 60_000,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const counts = q.data?.pages[0]?.counts;
  const tabCount = (k: Tab) =>
    counts
      ? (TABS[k] as readonly SheetState[]).reduce((s, st) => s + (counts[st] ?? 0), 0)
      : undefined;
  const columns: DataTableColumn<VendorInboxSheet>[] = [
    {
      id: "shop",
      header: t("vendor.shop", "Shop"),
      accessorFn: (r) => r.shop.name,
      cell: ({ row }) => <span className="font-medium">{row.original.shop.name}</span>,
    },
    { accessorKey: "name", header: t("sheets.name", "Sheet") },
    {
      accessorKey: "status",
      header: t("sheets.status", "Status"),
      cell: ({ row }) => <SheetStatusBadge status={row.original.status} />,
    },
    {
      id: "size",
      header: t("sheets.size", "Size"),
      cell: ({ row }) =>
        `${formatInches(row.original.widthIn)} × ${formatInches(row.original.lengthIn)}`,
    },
    { accessorKey: "transferCount", header: t("sheets.transfers", "Transfers") },
    {
      accessorKey: "cost",
      header: t("vendor.amount", "Amount"),
      cell: ({ row }) => <Money cents={row.original.cost} />,
    },
    {
      accessorKey: "sentAt",
      header: t("vendor.received", "Received"),
      cell: ({ row }) =>
        row.original.sentAt ? (
          <RelativeTime value={row.original.sentAt} className="text-muted-foreground" />
        ) : (
          "—"
        ),
    },
  ];
  return (
    <Page
      title={t("nav.sheetInbox")}
      description={t("vendor.subtitle", "Gang sheets from every shop you print for.")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) =>
            void navigate({ to: "/vendor", search: { ...search, tab: v as Tab }, replace: true })
          }
        >
          <TabsList>
            {(Object.keys(TABS) as Tab[]).map((k) => {
              const n = k === "all" ? undefined : tabCount(k);
              return (
                <TabsTrigger key={k} value={k} className="gap-1.5">
                  {t(`vendor.tab.${k}`, k.replace(/_/g, " "))}
                  {n !== undefined && n > 0 && (
                    <span className="text-xs text-muted-foreground">{n}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <NativeSelect
          aria-label={t("vendor.shop", "Shop")}
          value={search.shop ?? ""}
          onChange={(e) =>
            void navigate({
              to: "/vendor",
              search: { ...search, shop: e.target.value || undefined },
              replace: true,
            })
          }
        >
          <option value="">{t("vendor.allShops", "All shops")}</option>
          {shops.data?.items.map((s) => (
            <option key={s.orgId} value={s.orgId}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<VendorInboxSheet, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={q.isPending}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          onRowClick={(r) =>
            void navigate({ to: "/vendor/sheets/$sheetId", params: { sheetId: r.id } })
          }
          emptyTitle={t("vendor.empty", "No sheets here")}
          emptyDescription={t("vendor.emptyHint", "New sheets from shops show up here instantly.")}
          maxHeight="calc(100dvh - 15rem)"
        />
      )}
    </Page>
  );
}

import { PO_STATES, type PurchaseOrder } from "@invai/contracts";
import { Button, DataTable, type DataTableColumn, Money, RelativeTime } from "@invai/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, Page } from "../../../components/page";
import { PoStatusBadge } from "../../../components/po-badge";
import { ErrorState } from "../../../components/states";
import { formatDate } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/inventory/purchase-orders/")({
  component: PurchaseOrdersPage,
});

function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const q = useInfiniteQuery(
    orpc.inventory.purchaseOrders.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ status: status ? [status as never] : undefined, cursor, limit: 100 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const columns: DataTableColumn<PurchaseOrder>[] = [
    { accessorKey: "poNo", header: t("po.no", "PO"), cell: ({ row }) => <span className="font-medium">{row.original.poNo}</span> },
    { accessorKey: "supplier", header: t("blanks.supplier", "Supplier"), cell: ({ row }) => t(`supplier.${row.original.supplier}`, row.original.supplier) },
    { accessorKey: "status", header: t("sheets.status", "Status"), cell: ({ row }) => <PoStatusBadge status={row.original.status} /> },
    { id: "units", header: t("po.units", "Units"), cell: ({ row }) => {
      const qty = row.original.lines.reduce((s, l) => s + l.qty, 0);
      const rec = row.original.lines.reduce((s, l) => s + l.receivedQty, 0);
      return <span className="tabular-nums">{rec > 0 ? `${rec}/${qty}` : qty}</span>;
    } },
    { accessorKey: "total", header: t("orders.total", "Total"), cell: ({ row }) => <Money cents={row.original.total} /> },
    { accessorKey: "expectedAt", header: t("po.expected", "Expected"), cell: ({ row }) => formatDate(row.original.expectedAt) },
    { accessorKey: "createdAt", header: t("sheets.created", "Created"), cell: ({ row }) => <RelativeTime value={row.original.createdAt} className="text-muted-foreground" /> },
  ];
  return (
    <Page
      title={t("nav.purchaseOrders")}
      description={t("po.subtitle", "Orders to your blank suppliers, and receiving.")}
      actions={
        <Button variant="outline" asChild>
          <Link to="/inventory/stock" search={{ tab: "reorder" }}>
            <Lightbulb />
            {t("po.fromSuggestions", "Reorder suggestions")}
          </Link>
        </Button>
      }
    >
      <NativeSelect className="mb-3 w-fit" aria-label={t("sheets.status", "Status")} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">{t("po.allStatuses", "All statuses")}</option>
        {PO_STATES.map((s) => (
          <option key={s} value={s}>
            {t(`poState.${s}`, s.replace(/_/g, " "))}
          </option>
        ))}
      </NativeSelect>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<PurchaseOrder, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={q.isPending}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          onRowClick={(r) => void navigate({ to: "/inventory/purchase-orders/$poId", params: { poId: r.id } })}
          emptyTitle={t("po.empty", "No purchase orders")}
          emptyDescription={t("po.emptyHint", "Create one from the reorder suggestions.")}
          maxHeight="calc(100dvh - 15rem)"
        />
      )}
    </Page>
  );
}

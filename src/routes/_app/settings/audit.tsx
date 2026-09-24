import { AUDIT_ACTIONS, type AuditEntry } from "@invai/contracts";
import { Badge, DataTable, type DataTableColumn } from "@invai/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { formatDateTime } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState("");
  const q = useInfiniteQuery(
    orpc.audit.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        action: (action || undefined) as never,
        cursor,
        limit: 200,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const columns: DataTableColumn<AuditEntry>[] = [
    {
      accessorKey: "at",
      header: t("stock.when", "When"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(row.original.at)}
        </span>
      ),
    },
    { id: "actor", header: t("audit.who", "Who"), cell: ({ row }) => row.original.actor.name },
    {
      accessorKey: "action",
      header: t("audit.action", "Action"),
      cell: ({ row }) => <Badge variant="secondary">{row.original.action}</Badge>,
    },
    {
      accessorKey: "summary",
      header: t("audit.what", "What"),
      cell: ({ row }) => <span className="line-clamp-2">{row.original.summary}</span>,
    },
  ];
  return (
    <Page title={t("nav.audit")} description={t("audit.subtitle", "Who did what, and when.")}>
      <NativeSelect
        className="mb-3 w-fit"
        aria-label={t("audit.action", "Action")}
        value={action}
        onChange={(e) => setAction(e.target.value)}
      >
        <option value="">{t("audit.all", "All actions")}</option>
        {AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </NativeSelect>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<AuditEntry, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={q.isPending}
          hasMore={!!q.hasNextPage}
          isLoadingMore={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
          emptyTitle={t("audit.empty", "No activity yet")}
          maxHeight="calc(100dvh - 15rem)"
        />
      )}
    </Page>
  );
}

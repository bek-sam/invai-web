import type { ImportReport } from "@invai/contracts";
import { Badge, Button, RelativeTime } from "@invai/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, SkeletonRows } from "../../components/states";
import { orpc } from "../../lib/rpc";
import { RowErrors } from "../catalog/csv-import-dialog";
import { importInProgress } from "./status";

const PAGE = 5;

/** The last imports of one connection, newest first; refreshes itself while one is running. */
export function ImportHistory({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation();
  const q = useInfiniteQuery(
    orpc.channels.imports.infiniteOptions({
      input: (cursor: string | undefined) => ({ id: connectionId, cursor, limit: PAGE }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      refetchInterval: (query) =>
        query.state.data?.pages.some((p) => p.items.some(importInProgress)) ? 3_000 : false,
    }),
  );
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  if (q.isPending) return <SkeletonRows rows={2} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />;
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {t("channels.history.none", "No CSV imports yet. Import a file and it shows up here.")}
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((r) => (
          <ImportRow key={r.importId} report={r} />
        ))}
      </ul>
      {q.hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
          {t("channels.history.more", "Show older imports")}
        </Button>
      )}
    </div>
  );
}

function ImportRow({ report: r }: { report: ImportReport }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const running = importInProgress(r);
  const hasErrors = r.errors.length > 0;
  const status = (
    <Badge
      variant={
        r.status === "failed"
          ? "danger"
          : running
            ? "info"
            : r.rowsFailed > 0
              ? "warning"
              : "success"
      }
    >
      {running && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {r.status === "failed"
        ? t("channels.history.failed", "Failed")
        : r.status === "queued"
          ? t("channels.history.queued", "Waiting to start")
          : r.status === "running"
            ? t("channels.history.running", "Importing")
            : r.rowsFailed > 0
              ? t("channels.history.doneWithErrors", "Done, some rows failed")
              : t("channels.history.done", "Done")}
    </Badge>
  );
  const counts = running
    ? t("channels.history.rowsTotal", "{{n}} rows", { n: r.rowsTotal })
    : [
        t("channels.history.rows", "{{n}} rows", { n: r.rowsTotal }),
        t("channels.history.created", "{{n}} new", { n: r.ordersImported }),
        t("channels.history.updated", "{{n}} updated", { n: r.ordersUpdated }),
        r.ordersSkipped
          ? t("channels.history.unchanged", "{{n}} unchanged", { n: r.ordersSkipped })
          : "",
        r.rowsFailed ? t("channels.history.errors", "{{n}} failed", { n: r.rowsFailed }) : "",
      ]
        .filter(Boolean)
        .join(" · ");
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0 text-muted-foreground">
          <RelativeTime value={r.startedAt} />
        </span>
        <span className="min-w-0 tabular-nums">{counts}</span>
      </span>
      {status}
    </>
  );
  return (
    <li className="text-sm">
      {hasErrors ? (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          )}
          <span className="sr-only">{t("channels.history.showErrors", "Show row errors")}</span>
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 pl-9">{body}</div>
      )}
      {open && (
        <div className="px-3 pb-3">
          <RowErrors errors={r.errors} />
        </div>
      )}
    </li>
  );
}

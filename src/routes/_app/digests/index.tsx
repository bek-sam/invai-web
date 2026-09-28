import type { DigestSummary } from "@invai/contracts";
import { Badge, EmptyState, Skeleton } from "@invai/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AnyLink } from "../../../components/any-link";
import { Page } from "../../../components/page";
import { ErrorState } from "../../../components/states";
import { formatDay } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/digests/")({
  component: DigestsPage,
});

function DigestsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  const q = useInfiniteQuery(
    orpc.digest.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 50 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <Page
      wide={false}
      title={t("nav.digests", "Digests")}
      description={t("digest.list.subtitle", "Your past weekly reviews.")}
    >
      {q.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={t("digest.list.empty", "Your first weekly review lands next Monday")}
          description={t(
            "digest.list.emptyHint",
            "Come back after your shop's first full week to see it here.",
          )}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((d: DigestSummary) => (
            <li key={d.id}>
              <AnyLink
                to={`/digests/${d.weekKey}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">
                    {t("digest.list.weekOf", "Week of {{day}}", {
                      day: formatDay(d.weekStart),
                    })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {d.status === "skipped_quiet"
                      ? t("digest.skippedQuiet.title", "A quiet week")
                      : d.net
                        ? `${d.net.formatted[lang]}${d.netChange ? ` (${d.netChange.formatted[lang]})` : ""}`
                        : "—"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.actionCount > 0 && (
                    <Badge variant="secondary">
                      {t("digest.list.actionCount", "{{n}} actions", { n: d.actionCount })}
                    </Badge>
                  )}
                  {!d.viewedAt && d.status === "ready" && (
                    <Badge variant="info">{t("digest.list.newBadge", "New")}</Badge>
                  )}
                </div>
              </AnyLink>
            </li>
          ))}
          {q.hasNextPage && (
            <li className="flex justify-center py-2">
              {q.isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => void q.fetchNextPage()}
                >
                  {t("digest.list.loadMore", "Load more")}
                </button>
              )}
            </li>
          )}
        </ul>
      )}
    </Page>
  );
}

import { type Design, type DesignLifecycleRow, QA_STATUSES } from "@invai/contracts";
import { Badge, Button, Card, cn, EmptyState, Input, Skeleton, Switch } from "@invai/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { QA_TONE } from "../../../components/badges";
import { NativeSelect, Page } from "../../../components/page";
import { SignedImage } from "../../../components/signed-image";
import { ErrorState } from "../../../components/states";
import { useDebounced } from "../../../hooks/use-debounced";
import { useInView } from "../../../hooks/use-in-view";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

type LifecycleTone = "info" | "success" | "secondary" | "warning" | "danger" | "outline";

const STAGE_TONE: Record<DesignLifecycleRow["stage"], LifecycleTone> = {
  new: "info",
  growing: "success",
  steady: "secondary",
  declining: "warning",
  dead: "danger",
  inactive: "outline",
};

const TREND_TONE: Record<"rising" | "falling" | "flat", LifecycleTone> = {
  rising: "success",
  falling: "danger",
  flat: "secondary",
};

/**
 * AC-C4: the design's own lifecycle stage, unless the market module has a trend for it, which
 * wins (`marketTrend` is null, or `"insufficient"` meaning the market module has nothing useful
 * to say, in either case falling back to `stage`). `finance.read`-gated like every `analytics.*`
 * call (AC-E5), so the caller only renders this once it has already checked `can("finance.read")`.
 */
function DesignLifecycleBadge({ row }: { row: DesignLifecycleRow | undefined }) {
  const { t } = useTranslation();
  if (!row) return null;
  if (row.marketTrend && row.marketTrend !== "insufficient") {
    return (
      <Badge variant={TREND_TONE[row.marketTrend]} className="px-1.5 text-[10px]">
        {t(`designs.lifecycle.trend.${row.marketTrend}`, row.marketTrend)}
      </Badge>
    );
  }
  return (
    <Badge variant={STAGE_TONE[row.stage]} className="px-1.5 text-[10px]">
      {t(`designs.lifecycle.stage.${row.stage}`, row.stage)}
    </Badge>
  );
}

/**
 * B-209 / gate root-cause §1: the grid can hold the whole first page (up to 60 cards), and every
 * `<SignedImage>` used to fire its own `files.downloadUrl` call the instant it mounted, piling up
 * behind Chrome's 6-connections-per-origin cap. Each card now only mounts `SignedImage` (and so
 * only requests a signed URL) once it is within `useInView`'s `rootMargin` of the viewport; until
 * then it renders a plain static box -- never the loading `Skeleton` or a spinner, so
 * `settled()`'s `[data-slot=skeleton], .animate-spin` check isn't left waiting on cards that
 * haven't asked for anything yet.
 */
function DesignCard({
  design: d,
  canSeeLifecycle,
  lifecycleRow,
}: {
  design: Design;
  canSeeLifecycle: boolean;
  lifecycleRow: DesignLifecycleRow | undefined;
}) {
  const { t } = useTranslation();
  const { ref, inView } = useInView();
  return (
    <Link
      to="/catalog/designs/$designId"
      params={{ designId: d.id }}
      className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
    >
      {inView ? (
        <SignedImage
          fileKey={d.placements[0]?.previewKey ?? null}
          alt={d.name}
          className="aspect-square w-full rounded-none"
        />
      ) : (
        <div
          ref={ref}
          aria-hidden
          className={cn("aspect-square w-full rounded-none bg-muted", "checkerboard")}
        />
      )}
      <div className="flex flex-col gap-1 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{d.name}</span>
          {d.personalizationTemplateId && (
            <Sparkles
              className="size-3.5 shrink-0 text-info"
              aria-label={t("orders.personalized", "Personalized")}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-xs text-muted-foreground">{d.code}</span>
          <Badge variant={QA_TONE[d.qaStatus]} className="px-1.5 text-[10px]">
            {t(`qa.${d.qaStatus}`, d.qaStatus)}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">
            {t("designs.orders30", "{{count}} orders · 30d", { count: d.ordersLast30d })}
          </span>
          {canSeeLifecycle && <DesignLifecycleBadge row={lifecycleRow} />}
        </div>
      </div>
    </Link>
  );
}

export const Route = createFileRoute("/_app/catalog/designs/")({
  validateSearch: z.object({
    qa: z.enum(QA_STATUSES).optional().catch(undefined),
    archived: z.boolean().optional().catch(undefined),
  }),
  component: DesignsPage,
});

function DesignsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog/designs/" });
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const designs = useInfiniteQuery(
    orpc.designs.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        search: q || undefined,
        qaStatus: search.qa,
        status: search.archived ? "archived" : "active",
        cursor,
        limit: 60,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const items = useMemo(() => designs.data?.pages.flatMap((p) => p.items) ?? [], [designs.data]);
  // AC-C4: lifecycle stage per design; gated on finance.read like every analytics.* call
  // (AC-E5), so a role without it never calls the procedure and never sees a FORBIDDEN toast.
  const canSeeLifecycle = can("finance.read");
  // Gate root-cause §1: `.queryOptions()`'s generated queryFn always reads `context.signal`, so
  // TanStack Query always aborts the underlying fetch when this page unmounts mid-request (a
  // click on a design right after the grid settles). This call has no loading UI and nothing
  // depends on it finishing before navigation, so call the client directly (no signal) instead:
  // the request completes normally in the background rather than showing up as a failed request.
  const lifecycle = useQuery({
    queryKey: orpc.analytics.designLifecycle.queryKey({ input: {} }),
    queryFn: () => orpc.analytics.designLifecycle.call({}),
    enabled: canSeeLifecycle,
  });
  const lifecycleByDesign = useMemo(() => {
    const map = new Map<string, DesignLifecycleRow>();
    for (const row of lifecycle.data?.rows ?? []) map.set(row.designId, row);
    return map;
  }, [lifecycle.data]);
  return (
    <Page
      title={t("nav.designs")}
      description={t("designs.subtitle", "Print files, placements and print QA.")}
      actions={
        can("catalog.manage") && (
          <Button asChild>
            <Link to="/catalog/designs/$designId" params={{ designId: "new" }}>
              <ImagePlus />
              {t("designs.new", "New design")}
            </Link>
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("designs.search", "Search designs")}
            className="pl-8"
          />
        </div>
        <NativeSelect
          aria-label={t("designs.qa", "QA")}
          value={search.qa ?? ""}
          onChange={(e) =>
            void navigate({
              search: (p) => ({ ...p, qa: (e.target.value || undefined) as never }),
              replace: true,
            })
          }
        >
          <option value="">{t("designs.anyQa", "Any QA status")}</option>
          {QA_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`qa.${s}`, s)}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={!!search.archived}
            onCheckedChange={(v) =>
              void navigate({ search: (p) => ({ ...p, archived: v || undefined }), replace: true })
            }
          />
          {t("designs.archived", "Archived")}
        </label>
      </div>
      {designs.isError ? (
        <ErrorState error={designs.error} onRetry={() => void designs.refetch()} />
      ) : designs.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ImagePlus}
            title={t("designs.empty", "No designs yet")}
            description={t("designs.emptyHint", "Upload a print file to create your first design.")}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {items.map((d) => (
              <DesignCard
                key={d.id}
                design={d}
                canSeeLifecycle={canSeeLifecycle}
                lifecycleRow={lifecycleByDesign.get(d.id)}
              />
            ))}
          </div>
          {designs.hasNextPage && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => void designs.fetchNextPage()}
                disabled={designs.isFetchingNextPage}
              >
                {t("action.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

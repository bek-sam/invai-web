import { QA_STATUSES } from "@invai/contracts";
import { Badge, Button, Card, EmptyState, Input, Skeleton, Switch } from "@invai/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
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
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

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
              <Link
                key={d.id}
                to="/catalog/designs/$designId"
                params={{ designId: d.id }}
                className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
              >
                <SignedImage
                  fileKey={d.placements[0]?.previewKey ?? null}
                  alt={d.name}
                  className="aspect-square w-full rounded-none"
                />
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
                  <span className="text-xs text-muted-foreground">
                    {t("designs.orders30", "{{count}} orders · 30d", { count: d.ordersLast30d })}
                  </span>
                </div>
              </Link>
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

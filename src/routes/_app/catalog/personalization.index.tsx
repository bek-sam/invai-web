import { ITEM_ARTWORK_STATUSES, type ItemArtwork } from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  ShipByBadge,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Plus, RefreshCw, Type } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, Page } from "../../../components/page";
import { SignedImage } from "../../../components/signed-image";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { formatInches, orderLabel } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/catalog/personalization/")({
  component: PersonalizationPage,
});

function PersonalizationPage() {
  const { t } = useTranslation();
  const can = useCan();
  return (
    <Page
      title={t("nav.personalization")}
      description={t(
        "pers.subtitle",
        "Text templates rendered at 300 DPI, with overflow and typo checks before printing.",
      )}
      actions={
        can("personalization.manage") && (
          <Button asChild>
            <Link to="/catalog/personalization/$templateId" params={{ templateId: "new" }}>
              <Plus />
              {t("pers.newTemplate", "New template")}
            </Link>
          </Button>
        )
      }
    >
      <Tabs defaultValue="templates">
        <TabsList className="mb-3">
          <TabsTrigger value="templates">{t("pers.templates", "Templates")}</TabsTrigger>
          <TabsTrigger value="review">{t("pers.review", "Artwork review")}</TabsTrigger>
        </TabsList>
        <TabsContent value="templates">
          <TemplatesGrid />
        </TabsContent>
        <TabsContent value="review">
          <ArtworkReview />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function TemplatesGrid() {
  const { t } = useTranslation();
  const q = useQuery(orpc.personalization.templates.list.queryOptions({ input: { limit: 200 } }));
  if (q.isPending) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Type}
          title={t("pers.noTemplates", "No templates yet")}
          description={t(
            "pers.noTemplatesHint",
            "Create a template with text slots for names, dates or numbers.",
          )}
        />
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {q.data.items.map((tp) => (
        <Link
          key={tp.id}
          to="/catalog/personalization/$templateId"
          params={{ templateId: tp.id }}
          className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
        >
          <p className="font-medium">{tp.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatInches(tp.widthIn)} × {formatInches(tp.heightIn)} · {tp.dpi} DPI
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {tp.slots.map((s) => (
              <Badge key={s.name} variant="secondary">
                {s.name}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("pers.usedBy", "Used by {{count}} designs", { count: tp.designCount })}
          </p>
        </Link>
      ))}
    </div>
  );
}

function ArtworkReview() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string>("flagged");
  const q = useInfiniteQuery(
    orpc.personalization.artwork.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        status: status ? [status as never] : undefined,
        cursor,
        limit: 50,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const counts = q.data?.pages[0]?.counts;
  return (
    <div className="flex flex-col gap-3">
      <NativeSelect
        className="w-fit"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        aria-label={t("pers.status", "Status")}
      >
        <option value="">{t("pers.allStatuses", "All")}</option>
        {ITEM_ARTWORK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`artworkStatus.${s}`, s)}
            {counts ? ` (${counts[s] ?? 0})` : ""}
          </option>
        ))}
      </NativeSelect>
      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={CheckCircle2} title={t("pers.nothingToReview", "Nothing to review")} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <ArtworkCard key={a.orderItemId} artwork={a} />
          ))}
        </div>
      )}
      {q.hasNextPage && (
        <Button variant="outline" className="self-center" onClick={() => void q.fetchNextPage()}>
          {t("action.loadMore")}
        </Button>
      )}
    </div>
  );
}

function ArtworkCard({ artwork: a }: { artwork: ItemArtwork }) {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(a.values);
  const dirty = JSON.stringify(values) !== JSON.stringify(a.values);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.personalization.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
  };
  const approve = useMutation(
    orpc.personalization.artwork.approve.mutationOptions({
      onSuccess: () => {
        toast.success(t("orders.artworkApproved", "Artwork approved"));
        invalidate();
      },
    }),
  );
  const update = useMutation(
    orpc.personalization.artwork.update.mutationOptions({ onSuccess: invalidate }),
  );
  const rerender = useMutation(
    orpc.personalization.artwork.rerender.mutationOptions({ onSuccess: invalidate }),
  );
  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Link to="/orders" search={{ order: a.orderId }} className="font-medium hover:underline">
          {orderLabel(a.orderNo)}
        </Link>
        <span className="truncate text-sm text-muted-foreground">{a.designName}</span>
        <Badge
          variant={
            a.status === "flagged" || a.status === "failed"
              ? "warning"
              : a.status === "approved"
                ? "success"
                : "secondary"
          }
          className="ml-auto"
        >
          {t(`artworkStatus.${a.status}`, a.status)}
        </Badge>
        <ShipByBadge shipBy={a.shipBy} />
      </div>
      <SignedImage fileKey={a.previewKey} alt={a.designName} className="h-40 w-full" />
      {a.flags.length > 0 && (
        <ul className="text-xs">
          {a.flags.map((f) => (
            <li key={`${f.slot}-${f.code}`} className="text-warning">
              {f.slot ? `${f.slot}: ` : ""}
              {f.message}
              {f.suggestion && (
                <button
                  type="button"
                  className="ml-1 text-primary underline"
                  onClick={() => f.slot && setValues({ ...values, [f.slot]: f.suggestion ?? "" })}
                >
                  {t("pers.useSuggestion", "use “{{s}}”", { s: f.suggestion })}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(values).map(([slot, v]) => (
          <label key={slot} className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{slot}</span>
            <Input
              value={v}
              onChange={(e) => setValues({ ...values, [slot]: e.target.value })}
              disabled={!can("personalization.manage")}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("pers.buyerAnswers", "Buyer answers")}:{" "}
        {a.rawAnswers.map((r) => `${r.question}: ${r.answer ?? "—"}`).join(" · ")}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {can("personalization.manage") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => rerender.mutate({ orderItemId: a.orderItemId })}
            disabled={rerender.isPending}
          >
            <RefreshCw />
            {t("pers.rerender", "Re-render")}
          </Button>
        )}
        {dirty && can("personalization.manage") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => update.mutate({ orderItemId: a.orderItemId, values, approve: false })}
            disabled={update.isPending}
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            {t("pers.saveRender", "Save and render")}
          </Button>
        )}
        {a.status !== "approved" && can("artwork.approve") && (
          <Button
            size="sm"
            onClick={() =>
              dirty
                ? update.mutate({ orderItemId: a.orderItemId, values, approve: true })
                : approve.mutate({ orderItemId: a.orderItemId })
            }
            disabled={approve.isPending || update.isPending}
          >
            <CheckCircle2 />
            {t("orders.approveProof", "Approve proof")}
          </Button>
        )}
      </div>
    </Card>
  );
}

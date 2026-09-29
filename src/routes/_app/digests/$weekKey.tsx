import { Button, EmptyState, Skeleton } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, CalendarClock, PartyPopper } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localeNumber, weekOfLabel } from "../../../components/digest/digest-copy";
import { DigestGlanceGrid } from "../../../components/digest/glance-grid";
import { DigestInsightCard, DigestWinCard } from "../../../components/digest/insight-card";
import { Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { errorInfo } from "../../../lib/errors";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/digests/$weekKey")({
  component: DigestDetailPage,
});

function DigestDetailPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  const can = useCan();
  const { weekKey } = Route.useParams();
  const q = useQuery(orpc.digest.get.queryOptions({ input: { weekKey } }));
  const notifications = useQuery(orpc.me.notifications.get.queryOptions({ input: {} }));
  const queryClient = useQueryClient();
  const optIn = useMutation(
    orpc.me.notifications.set.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.me.key() }),
    }),
  );

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
      <Link to="/digests">
        <ArrowLeft />
        {t("nav.digests", "Digests")}
      </Link>
    </Button>
  );

  if (q.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {back}
        <SkeletonRows rows={3} />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    );
  }

  if (q.isError) {
    const info = errorInfo(q.error);
    if (info.code === "NOT_FOUND") {
      return (
        <div className="mx-auto w-full max-w-4xl">
          {back}
          <EmptyState
            icon={CalendarClock}
            title={t("digest.notReady.title", "Not ready yet")}
            description={t(
              "digest.notReady.body",
              "This week's review isn't built yet. Check back soon.",
            )}
          />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-4xl">
        {back}
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const d = q.data;
  const emailOn = notifications.data?.items.find((n) => n.kind === "digest")?.on === true;

  return (
    <Page
      wide={false}
      title={t("digest.page.title", "Week of {{day}}", { day: weekOfLabel(d.weekStart, lang) })}
      description={
        d.net
          ? `${d.net.formatted[lang]}${d.netChange ? ` (${d.netChange.formatted[lang]})` : ""}`
          : undefined
      }
    >
      {back}
      <div className="flex flex-col gap-4">
        {d.steady && (
          <p className="text-sm text-muted-foreground">
            {t("digest.steady", "A steady week. Here are your numbers.")}
          </p>
        )}
        {d.status === "skipped_quiet" && (
          <p className="text-sm text-muted-foreground">
            {t(
              "digest.skippedQuiet.body",
              "No orders last week, so there's nothing to review. No email was sent.",
            )}
          </p>
        )}
        {d.incompleteOrders > 0 && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            {t(
              "digest.incomplete",
              "Numbers are estimated: fees for {{n}} orders aren't final yet.",
              {
                n: d.incompleteOrders,
              },
            )}
          </p>
        )}
        {d.partialChannels.map((c) => (
          <p key={c} className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            {t("digest.partial", "{{channel}} was disconnected, so these numbers may be partial.", {
              channel: t(`channel.${c}`, c),
            })}
          </p>
        ))}

        {!emailOn && !notifications.isPending && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">
              {t("digest.optIn.prompt", "Get this in your inbox every Monday?")}
            </p>
            <Button
              size="sm"
              disabled={optIn.isPending}
              onClick={() => optIn.mutate({ kind: "digest", on: true })}
            >
              {t("digest.optIn.button", "Email me every week")}
            </Button>
          </div>
        )}

        <DigestGlanceGrid items={d.glance} />

        {d.planUsage && (
          <Section title={t("digest.plan.title", "Plan usage")}>
            <p className="text-sm text-muted-foreground">
              {t("digest.plan.orders", "{{used}} of {{limit}} orders used this billing period", {
                used: localeNumber(d.planUsage.ordersUsed, lang),
                limit:
                  d.planUsage.ordersLimit == null
                    ? t("digest.plan.unlimited", "unlimited")
                    : localeNumber(d.planUsage.ordersLimit, lang),
              })}
              {" · "}
              {t("digest.plan.aiCredits", "{{n}} AI credits left", {
                n: localeNumber(d.planUsage.aiCreditsRemaining, lang),
              })}
            </p>
          </Section>
        )}

        {d.actions.length > 0 && (
          <Section title={t("digest.actions.title", "This week's actions")}>
            <div className="flex flex-col gap-3">
              {d.actions.map((insight) => (
                <DigestInsightCard key={insight.id} digestId={d.id} insight={insight} />
              ))}
            </div>
          </Section>
        )}

        {d.win && (
          <Section
            title={
              <span className="flex items-center gap-1.5">
                <PartyPopper className="size-4" aria-hidden />
                {t("digest.win.title", "This week's win")}
              </span>
            }
          >
            <DigestWinCard digestId={d.id} insight={d.win} />
          </Section>
        )}

        {d.marketWatch.length > 0 && (
          <Section title={t("digest.marketWatch.title", "Market watch")}>
            <div className="flex flex-col gap-3">
              {d.marketWatch.map((insight) => (
                <DigestInsightCard key={insight.id} digestId={d.id} insight={insight} />
              ))}
            </div>
          </Section>
        )}

        {can("ai.assistant.ask") && (
          <Button variant="outline" asChild className="w-fit">
            <Link to="/assistant">
              <Bot />
              {t("digest.ask", "Ask the assistant about this week")}
            </Link>
          </Button>
        )}
      </div>
    </Page>
  );
}

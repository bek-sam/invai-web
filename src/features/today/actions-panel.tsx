import type { DigestInsight } from "@invai/contracts";
import { Badge, buttonVariants, Card, cn, EmptyState, formatMoney, Skeleton } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PartyPopper } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnyLink } from "../../components/any-link";
import { digestActionText, digestMoneyLang } from "../../components/digest/digest-copy";
import { Section } from "../../components/page";
import { ErrorState } from "../../components/states";
import { errorInfo } from "../../lib/errors";
import { orpc } from "../../lib/rpc";

/** Same split as `digest/insight-card.tsx`'s `parseHref` (that file isn't this card's to edit):
 * a contract `href` ("/analytics/profit?dim=day&days=7") into TanStack Router's `to` + `search`. */
function parseHref(href: string): { to: string; search?: Record<string, string> } {
  const qIndex = href.indexOf("?");
  if (qIndex === -1) return { to: href };
  return {
    to: href.slice(0, qIndex),
    search: Object.fromEntries(new URLSearchParams(href.slice(qIndex + 1))),
  };
}

/** `digestActionText` always needs these three; Today's actions never carry a `market` or `none`
 * kind (those are D8's win and the market watch, neither of which Today ranks as an action), so
 * stubbing them is safe and keeps this file from depending on the digest's recommendation types. */
const NO_RECOMMENDATION: Pick<DigestInsight, "recommendation" | "templateKey" | "facts"> = {
  recommendation: null,
  templateKey: "",
  facts: [],
};

/**
 * AC-E2: Today's action panel, `finance.read`-gated by the caller (like `DigestTodayCard`), so a
 * role without it never calls `today.actions` and never sees a FORBIDDEN toast. `generatedAt: null`
 * (today's set isn't built yet -- T-A9 ruling) and `NOT_IMPLEMENTED` (T-A9 not deployed yet) both
 * mean: say nothing, rather than a loud error on the busiest screen in the app.
 */
export function TodayActionsPanel() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const q = useQuery(orpc.today.actions.queryOptions({ input: {} }));
  const click = useMutation(
    orpc.today.recordActionClick.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.today.actions.key() }),
    }),
  );

  if (q.isPending) {
    return (
      <Section title={t("today.actionsTitle", "This week's actions")}>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Section>
    );
  }
  if (q.isError) {
    if (errorInfo(q.error).code === "NOT_IMPLEMENTED") return null;
    return (
      <Section title={t("today.actionsTitle", "This week's actions")}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      </Section>
    );
  }
  if (q.data.generatedAt === null) return null;

  return (
    <Section title={t("today.actionsTitle", "This week's actions")}>
      {q.data.steady ? (
        <EmptyState
          icon={PartyPopper}
          title={t("today.actionsSteady", "Nothing needs attention right now")}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {q.data.actions.map((action) => {
            const text = digestActionText(
              t,
              i18n.language,
              { action, ...NO_RECOMMENDATION },
              (k) => k,
            );
            const { to, search } = parseHref(action.href);
            return (
              <Card key={action.key} className="flex flex-col gap-2 p-3">
                {action.impactCents != null && (
                  <Badge variant="outline" className="w-fit">
                    {t("digest.impact", "~{{amount}} impact", {
                      amount: formatMoney(
                        Math.abs(action.impactCents),
                        "USD",
                        digestMoneyLang(i18n.language),
                      ),
                    })}
                  </Badge>
                )}
                <AnyLink
                  to={to}
                  search={search}
                  onClick={() => click.mutate({ date: q.data.date, key: action.key })}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-auto min-h-11 justify-start whitespace-normal text-left",
                  )}
                >
                  {text}
                </AnyLink>
              </Card>
            );
          })}
        </div>
      )}
    </Section>
  );
}

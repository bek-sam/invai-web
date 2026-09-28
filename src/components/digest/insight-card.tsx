import type { DigestInsight } from "@invai/contracts";
import { Badge, buttonVariants, cn, formatMoney } from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { orpc } from "../../lib/rpc";
import { AnyLink } from "../any-link";
import { RecommendationCard } from "../market/recommendation-card";
import { useNicheLabel } from "../market/use-niche-taxonomy";
import { digestActionText, digestWinText, sourceDateText } from "./digest-copy";
import { FeedbackThumbs } from "./feedback-thumbs";

/** Splits a contract `href` ("/orders?view=overdue") into TanStack Router's `to` + `search`. */
function parseHref(href: string): { to: string; search?: Record<string, string> } {
  const qIndex = href.indexOf("?");
  if (qIndex === -1) return { to: href };
  return {
    to: href.slice(0, qIndex),
    search: Object.fromEntries(new URLSearchParams(href.slice(qIndex + 1))),
  };
}

/**
 * One insight in the digest's `actions` list (D1-D7, or a market item promoted into an action
 * slot). A `detector: "market"` insight reuses T-18-5's `RecommendationCard` unmodified (its own
 * Done/Not useful buttons, AC17), with a source/date line built locally since the reused card
 * doesn't render one. Everything else gets the fixed action button plus thumbs feedback (AC32).
 */
export function DigestInsightCard({
  digestId,
  insight,
}: {
  digestId: string;
  insight: DigestInsight;
}) {
  const { t, i18n } = useTranslation();
  const nicheLabel = useNicheLabel();
  const queryClient = useQueryClient();
  const click = useMutation(
    orpc.digest.recordClick.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.digest.key() }),
    }),
  );

  if (insight.detector === "market" && insight.recommendation) {
    const rec = insight.recommendation;
    const source = rec.sources[0];
    return (
      <div className="flex flex-col gap-1.5">
        {source && (
          <p className="text-xs text-muted-foreground">
            {sourceDateText(t, i18n.language, source.source, source.asOf)}
          </p>
        )}
        <RecommendationCard rec={rec} />
      </div>
    );
  }

  const text = digestActionText(t, i18n.language, insight, nicheLabel);
  const { to, search } = parseHref(insight.action.href);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm">
      {insight.impactCents != null && (
        <Badge variant="outline" className="w-fit">
          {t("digest.impact", "~{{amount}} impact", {
            amount: formatMoney(Math.abs(insight.impactCents), "USD", i18n.language),
          })}
        </Badge>
      )}
      <AnyLink
        to={to}
        search={search}
        onClick={() => click.mutate({ digestId, insightId: insight.id })}
        className={cn(
          buttonVariants({ size: "lg" }),
          "h-auto min-h-11 justify-start whitespace-normal text-left",
        )}
      >
        {text}
      </AnyLink>
      {insight.action.kind === "review_ads" && (
        <p className="text-xs text-muted-foreground">
          {t("digest.action.adsNote", "Ad results are measured by channel, not by ad.")}
        </p>
      )}
      {insight.clicked && (
        <span className="inline-flex w-fit items-center gap-1 text-xs text-success">
          <Check className="size-3.5" aria-hidden />
          {t("digest.opened", "Opened")}
        </span>
      )}
      <FeedbackThumbs
        digestId={digestId}
        insightId={insight.id}
        actionText={text}
        myVote={insight.myVote}
      />
    </div>
  );
}

/** The digest's one `win` (D8): a celebration line, no button (spec: `none` is a win, celebrate). */
export function DigestWinCard({ digestId, insight }: { digestId: string; insight: DigestInsight }) {
  const { t, i18n } = useTranslation();
  const text = digestWinText(t, i18n.language, insight);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-sm">
      {insight.impactCents != null && (
        <Badge variant="success" className="w-fit">
          {formatMoney(Math.abs(insight.impactCents), "USD", i18n.language)}
        </Badge>
      )}
      <p className="font-medium">{text}</p>
      <FeedbackThumbs
        digestId={digestId}
        insightId={insight.id}
        actionText={text}
        myVote={insight.myVote}
      />
    </div>
  );
}

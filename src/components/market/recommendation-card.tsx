import type { MarketRecommendation, RecommendationVote } from "@invai/contracts";
import { Button, cn } from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../lib/errors";
import { orpc } from "../../lib/rpc";
import { ConfidenceBadge } from "./confidence-badge";
import { recommendationActionText } from "./recommendation-copy";
import { SampleDataBadge } from "./sample-data-badge";
import { useNicheLabel } from "./use-niche-taxonomy";

/**
 * A vote card for one stored recommendation (spec flow step 4, AC33). Binds to `rec.id`, which the
 * assistant stream and the stored message carry, so a vote lands on this exact record even after a
 * reload. A second tap re-sends the same idempotent vote; it never doubles up (AC27).
 */
export function RecommendationCard({
  rec,
  onVoted,
  className,
}: {
  rec: MarketRecommendation;
  onVoted?: (updated: MarketRecommendation) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const nicheLabel = useNicheLabel();
  const action = recommendationActionText(t, i18n.language, rec, nicheLabel);

  const vote = useMutation(
    orpc.market.recommendations.vote.mutationOptions({
      onSuccess: (updated) => {
        onVoted?.(updated);
        void queryClient.invalidateQueries({ queryKey: orpc.market.recommendations.key() });
      },
    }),
  );

  const cast = (v: RecommendationVote) => {
    if (vote.isPending) return;
    vote.mutate({ id: rec.id, vote: v });
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <ConfidenceBadge band={rec.band} />
        {rec.mock && <SampleDataBadge />}
      </div>
      <p>{action}</p>
      {rec.mock && (
        <p className="text-xs text-muted-foreground">
          {t(
            "market.rec.sample",
            "Sample data, not your real market: no market source is connected yet.",
          )}
        </p>
      )}
      {rec.stale && (
        <p className="text-xs text-warning">
          {t("market.stale.note", "This data is older than usual, so treat it with care.")}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={rec.vote === "done" ? "default" : "outline"}
          aria-pressed={rec.vote === "done"}
          disabled={vote.isPending}
          onClick={() => cast("done")}
          aria-label={t("market.vote.doneAria", "Mark '{{action}}' done", { action })}
        >
          <Check />
          {t("market.vote.done", "Done")}
        </Button>
        <Button
          size="sm"
          variant={rec.vote === "not_useful" ? "default" : "outline"}
          aria-pressed={rec.vote === "not_useful"}
          disabled={vote.isPending}
          onClick={() => cast("not_useful")}
          aria-label={t("market.vote.notUsefulAria", "Mark '{{action}}' not useful", { action })}
        >
          <X />
          {t("market.vote.notUseful", "Not useful")}
        </Button>
      </div>
      {vote.isError && <p className="text-xs text-danger">{errorMessage(vote.error)}</p>}
    </div>
  );
}

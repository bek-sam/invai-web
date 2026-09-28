import type { FeedbackReason, FeedbackVote } from "@invai/contracts";
import { Button, cn } from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../lib/errors";
import { orpc } from "../../lib/rpc";

const REASONS: { value: FeedbackReason; key: string; def: string }[] = [
  { value: "not_relevant", key: "digest.feedback.notRelevant", def: "Not relevant" },
  { value: "wrong", key: "digest.feedback.wrong", def: "Wrong" },
  { value: "already_knew", key: "digest.feedback.alreadyKnew", def: "Already knew" },
];

/**
 * Thumbs up/down on a non-market insight, with an optional reason on thumbs down (spec AC32).
 * Idempotent on (digest, insight, caller): the latest vote (and reason) wins, so re-tapping or
 * picking a different reason just replaces the stored row. Market watch items don't use this
 * (they reuse T-18-5's Done/Not useful vote card instead).
 */
export function FeedbackThumbs({
  digestId,
  insightId,
  actionText,
  myVote,
  className,
}: {
  digestId: string;
  insightId: string;
  actionText: string;
  myVote: FeedbackVote | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showReasons, setShowReasons] = useState(false);

  const vote = useMutation(
    orpc.digest.feedback.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.digest.key() }),
    }),
  );

  const cast = (v: FeedbackVote, reason?: FeedbackReason) => {
    if (vote.isPending) return;
    vote.mutate({ digestId, insightId, vote: v, reason });
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <Button
          size="icon"
          className="size-11"
          variant={myVote === "up" ? "default" : "outline"}
          aria-pressed={myVote === "up"}
          disabled={vote.isPending}
          onClick={() => {
            setShowReasons(false);
            cast("up");
          }}
          aria-label={t("digest.feedback.upAria", "Helpful: {{action}}", { action: actionText })}
        >
          <ThumbsUp className="size-4" />
        </Button>
        <Button
          size="icon"
          className="size-11"
          variant={myVote === "down" ? "default" : "outline"}
          aria-pressed={myVote === "down"}
          disabled={vote.isPending}
          onClick={() => {
            setShowReasons((s) => !s || myVote !== "down");
            cast("down");
          }}
          aria-label={t("digest.feedback.downAria", "Not helpful: {{action}}", {
            action: actionText,
          })}
        >
          <ThumbsDown className="size-4" />
        </Button>
      </div>
      {(showReasons || myVote === "down") && (
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <Button
              key={r.value}
              size="sm"
              variant="outline"
              className="h-11 px-3 text-xs"
              disabled={vote.isPending}
              onClick={() => cast("down", r.value)}
            >
              {t(r.key, r.def)}
            </Button>
          ))}
        </div>
      )}
      {vote.isError && <p className="text-xs text-danger">{errorMessage(vote.error)}</p>}
    </div>
  );
}

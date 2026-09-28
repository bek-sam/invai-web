import { Button, cn } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { orpc } from "../../lib/rpc";
import { AnyLink } from "../any-link";

/**
 * Today's digest promo (spec screens/flow step 1, AC1): "Your week in review is ready" with net
 * profit and its change, live on `digest.ready` (wired in `src/lib/realtime.ts`). Renders nothing
 * when there's no ready digest to show, except the quiet "paused" line after two skipped weeks.
 */
export function DigestTodayCard({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  const latest = useQuery(orpc.digest.latest.queryOptions({ input: {} }));
  const notifications = useQuery(orpc.me.notifications.get.queryOptions({ input: {} }));
  const queryClient = useQueryClient();
  const optIn = useMutation(
    orpc.me.notifications.set.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.me.key() }),
    }),
  );

  if (latest.isPending || latest.isError) return null;
  const d = latest.data.digest;

  if (d?.status !== "ready") {
    if (latest.data.paused) {
      return (
        <p className={cn("text-sm text-muted-foreground", className)}>
          {t("digest.paused", "We paused your digest until orders resume.")}
        </p>
      );
    }
    return null;
  }

  const emailOn = notifications.data?.items.find((n) => n.kind === "digest")?.on === true;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <CalendarCheck className="size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-medium">{t("digest.today.title", "Your week in review is ready")}</p>
          {d.net && (
            <p className="text-sm text-muted-foreground">
              {d.net.formatted[lang]}
              {d.netChange ? ` (${d.netChange.formatted[lang]})` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!emailOn && !notifications.isPending && (
          <Button
            size="sm"
            variant="outline"
            disabled={optIn.isPending}
            onClick={() => optIn.mutate({ kind: "digest", on: true })}
          >
            {t("digest.optIn.button", "Email me every week")}
          </Button>
        )}
        <Button size="sm" asChild>
          <AnyLink to={`/digests/${d.weekKey}`}>{t("digest.today.cta", "See this week")}</AnyLink>
        </Button>
      </div>
    </div>
  );
}

import { Switch } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { orpc } from "../../lib/rpc";
import { Section } from "../page";
import { ErrorState, SkeletonRows } from "../states";

/** Account → "Email me the weekly business review" (spec screens/flow step 5). */
export function DigestEmailToggleSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const q = useQuery(orpc.me.notifications.get.queryOptions({ input: {} }));
  const set = useMutation(
    orpc.me.notifications.set.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.me.key() }),
    }),
  );
  const digest = q.data?.items.find((n) => n.kind === "digest");

  return (
    <Section title={t("digest.account.title", "Weekly business review")}>
      {q.isPending ? (
        <SkeletonRows rows={1} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {t("digest.account.toggle", "Email me the weekly business review")}
          </p>
          <Switch
            checked={digest?.on === true}
            disabled={set.isPending}
            onCheckedChange={(on) => set.mutate({ kind: "digest", on })}
            aria-label={t("digest.account.toggle", "Email me the weekly business review")}
          />
        </div>
      )}
    </Section>
  );
}

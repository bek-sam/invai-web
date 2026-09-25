import type { Me } from "@invai/contracts";
import { toast } from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../lib/errors";
import { meQueryOptions } from "../../lib/me";
import { client } from "../../lib/rpc";

export type DemoAction = "start" | "reset" | "leave";

/**
 * Start, reset or leave the sample shop. Each call switches the session's company and returns
 * the new `Me`, so the cache starts over from it and Today opens.
 */
export function useDemoAction(action: DemoAction) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (): Promise<Me> => client.demo[action]({}),
    onSuccess: async (me) => {
      // Another company now: put the new `me` in place, then drop and refetch everything else.
      // (clear() would detach the mounted queries and leave the old company on screen.)
      const meKey = JSON.stringify(meQueryOptions().queryKey);
      queryClient.setQueryData(meQueryOptions().queryKey, me);
      await queryClient.resetQueries({
        predicate: (q) => JSON.stringify(q.queryKey) !== meKey,
      });
      await router.invalidate();
      await navigate({ to: "/" });
      if (action === "start") toast.success(t("demo.started", "You're in the sample shop"));
      if (action === "reset") toast.success(t("demo.resetDone", "Sample shop is fresh again"));
    },
    onError: (e) => {
      const title =
        action === "start"
          ? t("demo.startFailed", "Couldn't open the sample shop")
          : action === "reset"
            ? t("demo.resetFailed", "Couldn't reset the sample shop")
            : t("demo.leaveFailed", "Couldn't leave the sample shop");
      toast.error(title, { description: errorMessage(e) });
    },
  });
}

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type UpgradeReason, upgradeReason } from "../../lib/errors";
import { useCan } from "../../lib/me";

/** A query that keeps failing the same way (focus refetch, polling) re-opens it at most this often. */
const QUERY_REPEAT_MS = 5 * 60 * 1000;

/**
 * Listens to every query and mutation in the app and opens one translated dialog when the server
 * refuses something because of the plan (PLAN_LIMIT_REACHED, CREDITS_EXHAUSTED) or because there's
 * no active plan (PAYMENT_REQUIRED). Mounted once, in the app frame.
 */
export function UpgradePromptHost() {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const lastQueryPrompt = useRef(new Map<string, number>());

  useEffect(() => {
    const offMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      const r = upgradeReason(event.action.error);
      if (r) setReason(r);
    });
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      const r = upgradeReason(event.action.error);
      if (!r) return;
      const key = `${event.query.queryHash}:${r.kind}`;
      const now = Date.now();
      const last = lastQueryPrompt.current.get(key) ?? 0;
      if (now - last < QUERY_REPEAT_MS) return;
      lastQueryPrompt.current.set(key, now);
      setReason(r);
    });
    return () => {
      offMutations();
      offQueries();
    };
  }, [queryClient]);

  return <UpgradeDialog reason={reason} onClose={() => setReason(null)} />;
}

export function UpgradeDialog({
  reason,
  onClose,
}: {
  reason: UpgradeReason | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const canSeeBilling = can("billing.read");
  const { title, body } = reason ? upgradeCopy(reason, t) : { title: "", body: "" };
  return (
    <Dialog open={reason !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {!canSeeBilling && (
          <p className="text-sm text-muted-foreground">
            {t("upgrade.askOwner", "Ask the account owner to update the plan in Billing.")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {canSeeBilling ? t("upgrade.notNow", "Not now") : t("action.close", "Close")}
          </Button>
          {canSeeBilling && (
            <Button asChild>
              <Link to="/settings/billing" onClick={onClose}>
                {t("upgrade.goToBilling", "Go to Billing")}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function upgradeCopy(reason: UpgradeReason, t: T): { title: string; body: string } {
  if (reason.kind === "payment") {
    return {
      title: t("upgrade.paymentTitle", "This needs an active plan"),
      body: t(
        "upgrade.paymentBody",
        "Your trial has ended or a payment didn't go through. Choose a plan to keep importing orders and buying labels. Everything else still works.",
      ),
    };
  }
  const title = t("upgrade.limitTitle", "You've reached your plan's limit");
  const n = { used: reason.used ?? 0, limit: reason.limit ?? 0 };
  const known = reason.limit !== null;
  switch (reason.meter) {
    case "orders":
      return {
        title,
        body: known
          ? t(
              "upgrade.limit.orders",
              "Your plan includes {{limit}} orders a month. Upgrade to keep importing orders.",
              n,
            )
          : t(
              "upgrade.limit.ordersAny",
              "Your plan's monthly orders are used up. Upgrade to keep importing orders.",
            ),
      };
    case "users":
      return {
        title,
        body: known
          ? t(
              "upgrade.limit.users",
              "Your plan allows {{limit}} people. Upgrade to invite more.",
              n,
            )
          : t(
              "upgrade.limit.usersAny",
              "Your plan has no room for more people. Upgrade to invite more.",
            ),
      };
    case "connections":
      return {
        title,
        body: known
          ? t(
              "upgrade.limit.connections",
              "Your plan allows {{limit}} channel connections. Upgrade to connect another channel.",
              n,
            )
          : t(
              "upgrade.limit.connectionsAny",
              "Your plan has no room for another channel. Upgrade to connect it.",
            ),
      };
    case "aiCredits":
      return {
        title: t("upgrade.creditsTitle", "You're out of AI credits"),
        body: t(
          "upgrade.limit.aiCredits",
          "This month's AI credits are used up. Buy a credit pack or upgrade your plan to keep using AI.",
        ),
      };
    default:
      return {
        title,
        body: t("upgrade.limit.generic", "Upgrade your plan to keep going."),
      };
  }
}

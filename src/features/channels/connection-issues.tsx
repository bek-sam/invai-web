import type { ChannelConnection, ConnectionHealth } from "@invai/contracts";
import { Switch, toast } from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Hourglass, KeyRound, Webhook } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { orpc } from "../../lib/rpc";
import { type ConnectionIssue, connectionIssues, stockPush } from "./status";

/** Plain-language lines for what's wrong with a connection; nothing when it's healthy. */
export function ConnectionIssues({
  connection,
  health,
}: {
  connection: ChannelConnection;
  health: ConnectionHealth;
}) {
  const issues = connectionIssues(connection, health);
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {issues.map((issue) => (
        <IssueLine key={issue.kind} issue={issue} channel={connection.channel} />
      ))}
    </ul>
  );
}

function IssueLine({ issue, channel }: { issue: ConnectionIssue; channel: string }) {
  const { t } = useTranslation();
  const name = t(`channel.${channel}`, channel);
  const [Icon, tone, text] = (() => {
    switch (issue.kind) {
      case "pending":
        return [
          Hourglass,
          "text-warning",
          t(
            "channels.issue.pending",
            "Shopify approval wasn't finished. Reconnect to open Shopify's approval screen again.",
          ),
        ] as const;
      case "token":
        return [
          KeyRound,
          "text-danger",
          issue.permanent
            ? t(
                "channels.issue.tokenLost",
                "Shopify stopped accepting our access to this store. New orders can't arrive until you disconnect it and connect it again.",
              )
            : t(
                "channels.issue.tokenRetry",
                "Shopify access couldn't be renewed. We keep trying. If this lasts, disconnect the store and connect it again.",
              ),
        ] as const;
      case "webhooks":
        return [
          Webhook,
          "text-warning",
          t(
            "channels.issue.webhooks",
            "Shopify isn't sending instant order updates. Orders still arrive every 10 minutes. If this lasts, disconnect the store and connect it again.",
          ),
        ] as const;
      case "approval":
        return [
          Hourglass,
          "text-muted-foreground",
          t(
            "channels.issue.approval",
            "{{name}} hasn't approved our app yet. Import its CSV export until then.",
            { name },
          ),
        ] as const;
      case "stale":
        return [
          Clock,
          "text-warning",
          t("channels.issue.stale", "No sync in {{n}} minutes. Press Sync to try now.", {
            n: issue.minutes,
          }),
        ] as const;
      case "error":
        return [
          AlertTriangle,
          "text-danger",
          t("channels.issue.error", "The last sync had a problem. Press Sync to try again."),
        ] as const;
    }
  })();
  const detail = "detail" in issue ? issue.detail : null;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
      <span className="min-w-0">
        {text}
        {detail && (
          <details className="mt-0.5 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              {t("channels.issue.details", "Details")}
            </summary>
            <span className="break-words">{detail}</span>
          </details>
        )}
      </span>
    </li>
  );
}

/** The stock-push opt-in (T-3-3) on a connection card, with what it does and an undo. */
export function StockPushToggle({
  connection: c,
  health,
  canManage,
}: {
  connection: ChannelConnection;
  health: ConnectionHealth;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const state = stockPush(c, health);
  const update = useMutation(
    orpc.channels.update.mutationOptions({
      onSettled: () => void queryClient.invalidateQueries({ queryKey: orpc.channels.key() }),
    }),
  );
  if (state === "hidden") return null;
  const on = update.isPending
    ? (update.variables?.settings?.pushAvailability ?? c.settings.pushAvailability)
    : c.settings.pushAvailability;
  const set = (value: boolean, undo = true) =>
    update.mutate(
      { id: c.id, settings: { pushAvailability: value } },
      {
        onSuccess: () => {
          if (!undo) return;
          toast.success(
            value
              ? t("channels.stock.onToast", "Stock updates to {{name}} are on", { name: c.name })
              : t("channels.stock.offToast", "Stock updates to {{name}} are off", { name: c.name }),
            {
              action: {
                label: t("channels.stock.undo", "Undo"),
                onClick: () => set(!value, false),
              },
            },
          );
        },
      },
    );
  return (
    <div className="flex items-start gap-3 rounded-md bg-muted/40 px-3 py-2">
      <Switch
        id={id}
        checked={on}
        disabled={!canManage || update.isPending}
        onCheckedChange={(v) => set(v)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
      <div className="min-w-0 text-sm">
        <label htmlFor={id} className="font-medium">
          {t("channels.stock.label", "Send blank stock to this store")}
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {t(
            "channels.stock.hint",
            "Each listing gets the number of matching blanks you have on hand, minus what's already reserved, so it sells out when a blank runs out. Updates go out within 30 seconds of a stock change, starting with the next change. Only mapped listings are updated.",
          )}
          {state === "paused" &&
            ` ${t("channels.stock.paused", "Paused until the store is connected and approved.")}`}
        </p>
      </div>
    </div>
  );
}

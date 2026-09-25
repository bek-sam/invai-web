import { Button, cn } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Clock, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMe } from "../../lib/me";
import { orpc } from "../../lib/rpc";
import { type BillingBannerKind, billingBanner } from "./status";
import { UpgradePromptHost } from "./upgrade-prompt";

const DISMISS_KEY = "invai.trialBanner.dismissed";

/**
 * The app frame's billing strip: trial ending (last 7 days), past due, trial expired. Shown to people
 * who can see billing; the trial reminder can be hidden for the session, the other two can't.
 * Also mounts the app-wide upgrade dialog.
 */
export function BillingBanner() {
  const me = useMe();
  const canRead = me.org.type === "shop" && me.permissions.includes("billing.read");
  return (
    <>
      {canRead && <BillingBannerStrip />}
      <UpgradePromptHost />
    </>
  );
}

function BillingBannerStrip() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const status = useQuery(
    orpc.billing.get.queryOptions({ input: {}, staleTime: 5 * 60_000, retry: false }),
  );
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const banner = status.data ? billingBanner(status.data) : null;
  if (!banner || (banner.kind === "trial_ending" && dismissed)) return null;

  const urgent = banner.kind !== "trial_ending";
  const Icon = urgent ? AlertTriangle : Clock;
  const onBilling = pathname.startsWith("/settings/billing");
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm sm:mb-4",
        urgent
          ? "border-danger/40 bg-danger/10 text-foreground"
          : "border-warning/40 bg-warning/10 text-foreground",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", urgent ? "text-danger" : "text-warning")}
        aria-hidden
      />
      <p className="min-w-0 flex-1 max-sm:basis-[calc(100%-1.75rem)]">{bannerText(banner, t)}</p>
      <div className="flex items-center gap-1 max-sm:ml-7 max-sm:w-[calc(100%-1.75rem)] max-sm:justify-between">
        {!onBilling && (
          <Button asChild size="sm" variant={urgent ? "default" : "outline"}>
            <Link to="/settings/billing">
              {banner.kind === "past_due"
                ? t("billingBanner.fixPayment", "Update payment")
                : t("billingBanner.choosePlan", "Choose a plan")}
            </Link>
          </Button>
        )}
        {banner.kind === "trial_ending" && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t("billingBanner.dismiss", "Hide this reminder")}
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(DISMISS_KEY, "1");
              } catch {}
            }}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function bannerText(banner: BillingBannerKind, t: T): string {
  switch (banner.kind) {
    case "past_due":
      return t(
        "billingBanner.pastDue",
        "Your last payment didn't go through. Update your card to keep your plan.",
      );
    case "trial_expired":
      return t(
        "billingBanner.trialExpired",
        "Your free trial has ended. Order imports and label buying are paused until you choose a plan.",
      );
    case "trial_ending":
      if (banner.daysLeft <= 0)
        return t(
          "billingBanner.trialToday",
          "Your free trial ends today. Choose a plan to keep going.",
        );
      if (banner.daysLeft === 1)
        return t(
          "billingBanner.trialTomorrow",
          "Your free trial ends tomorrow. Choose a plan to keep going.",
        );
      return t(
        "billingBanner.trialDays",
        "Your free trial ends in {{n}} days. Choose a plan to keep going.",
        { n: banner.daysLeft },
      );
  }
}

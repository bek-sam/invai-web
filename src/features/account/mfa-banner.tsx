import { Button } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../lib/format";
import { meQueryOptions } from "../../lib/me";
import { showMfaBanner } from "./mfa";

const DISMISS_KEY = "invai.mfaBannerDismissed";

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Owners and admins need two-step sign-in" strip while the grace period runs. Dismissing hides it
 * for this browser session only. It reads the last known `mfa` while `me` refetches (switching
 * company), so it never flickers off and on; `required` is per user, not per company.
 */
export function MfaBanner() {
  const { t } = useTranslation();
  const { data } = useQuery(meQueryOptions());
  const last = useRef(data?.mfa);
  if (data) last.current = data.mfa;
  const [dismissed, setDismissed] = useState(wasDismissed);
  const mfa = data ? data.mfa : last.current;
  if (dismissed || !showMfaBanner(mfa)) return null;
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm sm:mb-4"
    >
      <ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 max-sm:basis-[calc(100%-1.75rem)]">
        {t("mfaBanner.text", "Owners and admins need two-step sign-in. Turn it on by {{date}}.", {
          date: formatDate(mfa?.deadline),
        })}
      </p>
      <Button size="sm" variant="outline" className="max-sm:ml-7" asChild>
        <Link to="/account">{t("mfaBanner.action", "Turn on two-step sign-in")}</Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        aria-label={t("mfaBanner.dismiss", "Hide for now")}
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // Hiding for this page view is enough when storage is blocked.
          }
          setDismissed(true);
        }}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}

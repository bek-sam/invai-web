import { Button } from "@invai/ui";
import { FlaskConical, Loader2, LogOut, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { useMe } from "../../lib/me";
import { hasOtherCompany, isOwnDemo } from "./is-own-demo";
import { useDemoAction } from "./use-demo";

/** The strip across the top of every screen while someone is in their sample shop. */
export function DemoBanner() {
  const { t } = useTranslation();
  const me = useMe();
  const reset = useDemoAction("reset");
  const leave = useDemoAction("leave");
  const [confirmReset, setConfirmReset] = useState(false);
  if (!isOwnDemo(me)) return null;
  const busy = reset.isPending || leave.isPending;

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-lg border border-info/40 bg-info/10 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 gap-2">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <div className="min-w-0 text-sm">
          <p className="font-medium">{t("demo.bannerTitle", "Demo: this is a sample shop")}</p>
          <p className="text-muted-foreground">
            {t(
              "demo.bannerBody",
              "Try anything here. It's sample data, your real shop isn't touched, and nothing goes out to customers or marketplaces.",
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmReset(true)}>
          <RotateCcw />
          {t("demo.reset", "Reset demo")}
        </Button>
        {hasOtherCompany(me) && (
          <Button size="sm" disabled={busy} onClick={() => leave.mutate()}>
            {leave.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("demo.leave", "Leave demo")}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("demo.resetTitle", "Reset the sample shop?")}
        description={t(
          "demo.resetBody",
          "Everything you changed here is thrown away and the sample data starts over. Your real shop isn't touched.",
        )}
        confirmLabel={t("demo.resetConfirm", "Reset sample data")}
        destructive
        pending={reset.isPending}
        onConfirm={() => reset.mutate(undefined, { onSettled: () => setConfirmReset(false) })}
      />
    </div>
  );
}

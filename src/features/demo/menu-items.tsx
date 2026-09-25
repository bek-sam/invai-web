import { DropdownMenuItem } from "@invai/ui";
import { useNavigate } from "@tanstack/react-router";
import { FlaskConical, ListChecks, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMe } from "../../lib/me";
import { useChecklistDismiss } from "../onboarding/checklist";
import { hasOtherCompany, isOwnDemo } from "./is-own-demo";
import { useDemoAction } from "./use-demo";

/** Account menu entries: the sample shop (try or leave) and the setup checklist. */
export function DemoMenuItems() {
  const { t } = useTranslation();
  const me = useMe();
  const start = useDemoAction("start");
  const leave = useDemoAction("leave");
  const reopen = useChecklistDismiss();
  const navigate = useNavigate();
  if (me.org.type !== "shop") return null;
  const ownDemo = isOwnDemo(me);
  return (
    <>
      {me.onboarding?.dismissed && (
        <DropdownMenuItem
          onSelect={() => {
            reopen.mutate({ dismissed: false });
            void navigate({ to: "/" });
          }}
        >
          <ListChecks className="size-4" />
          {t("onboarding.reopen", "Show setup checklist")}
        </DropdownMenuItem>
      )}
      {ownDemo ? (
        hasOtherCompany(me) && (
          <DropdownMenuItem disabled={leave.isPending} onSelect={() => leave.mutate()}>
            <LogOut className="size-4" />
            {t("demo.leave", "Leave demo")}
          </DropdownMenuItem>
        )
      ) : (
        <DropdownMenuItem disabled={start.isPending} onSelect={() => start.mutate()}>
          <FlaskConical className="size-4" />
          {start.isPending
            ? t("demo.starting", "Setting up the sample shop…")
            : t("demo.try", "Try with sample data")}
        </DropdownMenuItem>
      )}
    </>
  );
}

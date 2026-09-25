import { Button, cn, Progress, toast } from "@invai/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { CheckCircle2, Circle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnyLink } from "../../components/any-link";
import { Section } from "../../components/page";
import { errorMessage } from "../../lib/errors";
import { meQueryOptions } from "../../lib/me";
import { orpc } from "../../lib/rpc";
import { TryDemoButton } from "../demo/try-demo-button";
import {
  CHECKLIST_STEPS,
  type Checklist,
  type ChecklistStepKey,
  checklistProgress,
  isEmptyWorkspace,
  showChecklist,
} from "./steps";

function stepLabel(t: TFunction, key: ChecklistStepKey): string {
  switch (key) {
    case "channelConnected":
      return t("onboarding.channel", "Connect a sales channel or import a CSV");
    case "blanksImported":
      return t("onboarding.blanks", "Import your blanks");
    case "designsUploaded":
      return t("onboarding.designs", "Upload your designs");
    case "skusMapped":
      return t("onboarding.skus", "Map your SKUs to designs and blanks");
    case "vendorAdded":
      return t("onboarding.vendor", "Add your DTF vendor");
    case "shipFromAddress":
      return t("onboarding.shipFrom", "Add your ship-from address");
    case "carrier":
      return t("onboarding.carrier", "Choose your shipping carriers");
    case "costsSet":
      return t("onboarding.costs", "Check your costs for true profit");
    case "staffInvited":
      return t("onboarding.staff", "Invite your team");
    case "tabletPaired":
      return t("onboarding.tablet", "Pair a floor tablet");
    case "planChosen":
      return t("onboarding.plan", "Choose a plan");
  }
}

/** Hide or bring back the checklist; `me` is updated in place so Today reacts at once. */
export function useChecklistDismiss() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation(
    orpc.today.dismissChecklist.mutationOptions({
      onSuccess: (onboarding) => {
        queryClient.setQueryData(meQueryOptions().queryKey, (me) =>
          me ? { ...me, onboarding } : me,
        );
      },
      onError: (e) =>
        toast.error(t("onboarding.saveFailed", "Couldn't update the checklist"), {
          description: errorMessage(e),
        }),
    }),
  );
}

/** "Get set up" on Today: 11 steps, each ticked from the shop's own data. */
export function OnboardingChecklist({
  checklist,
  isDemo,
}: {
  checklist: Checklist;
  isDemo: boolean;
}) {
  const { t } = useTranslation();
  const dismiss = useChecklistDismiss();
  if (!showChecklist(checklist)) return null;
  const { done, total } = checklistProgress(checklist);

  function hide() {
    dismiss.mutate(
      { dismissed: true },
      {
        onSuccess: () =>
          toast(t("onboarding.hidden", "Checklist hidden. Open it again from your account menu."), {
            action: {
              label: t("onboarding.undo", "Undo"),
              onClick: () => dismiss.mutate({ dismissed: false }),
            },
          }),
      },
    );
  }

  return (
    <Section
      title={t("onboarding.title", "Get set up")}
      description={t("onboarding.progress", "{{done}} of {{total}} done", { done, total })}
      actions={
        <Button
          variant="ghost"
          size="icon"
          onClick={hide}
          disabled={dismiss.isPending}
          aria-label={t("onboarding.hide", "Hide checklist")}
        >
          <X />
        </Button>
      }
    >
      <Progress value={(done / total) * 100} className="mb-3" />
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {CHECKLIST_STEPS.map((s) => {
          const ok = checklist[s.key];
          return (
            <li key={s.key}>
              <AnyLink
                to={s.to}
                className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                {ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className={cn(ok && "text-muted-foreground line-through")}>
                  {stepLabel(t, s.key)}
                </span>
                <span className="sr-only">
                  {ok ? t("onboarding.stepDone", "Done") : t("onboarding.stepOpen", "Not done yet")}
                </span>
              </AnyLink>
            </li>
          );
        })}
      </ul>
      {!isDemo && isEmptyWorkspace(checklist) && (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-dashed border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t(
              "demo.tryHint",
              "Want to look around first? Open a sample shop full of orders. Your shop stays as it is.",
            )}
          </p>
          <TryDemoButton />
        </div>
      )}
    </Section>
  );
}

import type { PlanKey } from "@invai/contracts";
import { Badge, Button, Card, cn, Money, Progress, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { formatDate } from "../../../lib/format";
import { meQueryOptions, useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/billing")({
  component: BillingPage,
});

function BillingPage() {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const status = useQuery(orpc.billing.get.queryOptions({ input: {} }));
  const plans = useQuery(orpc.billing.plans.queryOptions({ input: {}, retry: false }));
  const credits = useQuery(orpc.ai.credits.balance.queryOptions({ input: {}, retry: false }));
  const change = useMutation(
    orpc.billing.changePlan.mutationOptions({
      onSuccess: (r) => {
        if (r.checkoutUrl) {
          window.location.href = r.checkoutUrl;
          return;
        }
        toast.success(
          t("billing.changed", "Plan changed to {{plan}}", { plan: r.status.plan.name }),
        );
        void queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
        void queryClient.invalidateQueries({ queryKey: meQueryOptions().queryKey });
      },
    }),
  );
  return (
    <Page
      wide={false}
      title={t("nav.billing")}
      description={t("billing.subtitle", "Your plan, usage this period and AI credits.")}
    >
      {status.isPending ? (
        <SkeletonRows rows={6} />
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Section
            title={
              <span className="flex items-center gap-2">
                {status.data.plan.name}
                <Badge
                  variant={
                    status.data.status === "active"
                      ? "success"
                      : status.data.status === "trialing"
                        ? "info"
                        : "danger"
                  }
                >
                  {t(`billingStatus.${status.data.status}`, status.data.status.replace(/_/g, " "))}
                </Badge>
              </span>
            }
            description={
              status.data.trialEndsAt
                ? t("billing.trialEnds", "Trial ends {{date}}", {
                    date: formatDate(status.data.trialEndsAt),
                  })
                : t("billing.period", "Period {{from}} – {{to}}", {
                    from: formatDate(status.data.usage.periodStart),
                    to: formatDate(status.data.usage.periodEnd),
                  })
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {(["orders", "aiCredits", "users", "connections"] as const).map((k) => {
                const m = status.data.usage[k];
                return (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{t(`billing.meter.${k}`, k)}</span>
                      <span className={cn("tabular-nums", m.limitReached && "text-danger")}>
                        {m.used.toLocaleString()} /{" "}
                        {m.limit === null ? "∞" : m.limit.toLocaleString()}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, (m.ratio ?? 0) * 100)}
                      className={cn(m.limitReached && "[&>div]:bg-danger")}
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("billing.labels", "{{n}} labels bought this period", {
                n: status.data.usage.labelsBought,
              })}{" "}
              · <Money cents={status.data.usage.labelFees} /> {t("billing.labelFees", "label fees")}
              {credits.data &&
                ` · ${t("assistant.credits", "{{n}} AI credits left", { n: credits.data.remaining })}`}
            </p>
            {!status.data.paymentsEnabled && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "billing.stub",
                  "Payments are not connected yet; plan changes apply immediately.",
                )}
              </p>
            )}
          </Section>
          {plans.data && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {plans.data.items
                .filter((p) => p.key !== "trial")
                .map((p) => {
                  const current = p.key === status.data.plan.key;
                  return (
                    <Card
                      key={p.key}
                      className={cn("flex flex-col gap-2 p-4", current && "border-primary")}
                    >
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-2xl font-semibold">
                        <Money cents={p.priceMonthly} />
                        <span className="text-sm font-normal text-muted-foreground">
                          /{t("billing.month", "mo")}
                        </span>
                      </p>
                      <ul className="flex-1 text-sm text-muted-foreground">
                        <li>
                          {p.ordersPerMonth === null
                            ? t("billing.unlimited", "Unlimited orders")
                            : t("billing.orders", "{{n}} orders/mo", {
                                n: p.ordersPerMonth.toLocaleString(),
                              })}
                        </li>
                        <li>
                          {t("billing.credits", "{{n}} AI credits", {
                            n: p.aiCreditsPerMonth.toLocaleString(),
                          })}
                        </li>
                        <li>
                          {p.maxUsers === null
                            ? t("billing.anyUsers", "Unlimited users")
                            : t("billing.users", "{{n}} users", { n: p.maxUsers })}
                        </li>
                        <li>
                          <Money cents={p.labelFee} /> {t("billing.perLabel", "per label")}
                        </li>
                      </ul>
                      {current ? (
                        <Badge variant="secondary" className="self-start">
                          {t("billing.current", "Current plan")}
                        </Badge>
                      ) : (
                        can("billing.manage") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => change.mutate({ plan: p.key as PlanKey })}
                            disabled={change.isPending}
                          >
                            {change.isPending && change.variables?.plan === p.key && (
                              <Loader2 className="animate-spin" />
                            )}
                            {t("billing.switch", "Switch")}
                          </Button>
                        )
                      )}
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

import type { BillingStatus, CreditEntry, Plan, PlanKey } from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  cn,
  DataTable,
  type DataTableColumn,
  Money,
  Progress,
  RelativeTime,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, Info, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { billingActionError } from "../../../features/billing/checkout";
import { CREDIT_PACKS } from "../../../features/billing/packs";
import {
  choosablePlans,
  daysUntil,
  isCustomPlan,
  type PlanMove,
  planMove,
} from "../../../features/billing/status";
import { errorInfo } from "../../../lib/errors";
import { formatDate } from "../../../lib/format";
import { meQueryOptions, useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/billing")({
  validateSearch: z.object({
    checkout: z.enum(["success", "cancel"]).optional().catch(undefined),
    /** Set by the test-mode checkout and portal, which never charge or change anything. */
    mock: z.unknown().optional(),
    portal: z.string().optional().catch(undefined),
  }),
  component: BillingPage,
});

type T = ReturnType<typeof useTranslation>["t"];
type Notice = "success" | "cancel" | "testCheckout" | "testPortal";

/** After a successful checkout, Stripe's webhook updates the plan a few seconds later: poll for it. */
const RETURN_POLL_MS = 2_000;
const RETURN_POLL_FOR_MS = 30_000;

function BillingPage() {
  const { t } = useTranslation();
  const can = useCan();
  const canManage = can("billing.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pollUntil, setPollUntil] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [downgradeTo, setDowngradeTo] = useState<Plan | null>(null);
  const [confirmFree, setConfirmFree] = useState(false);

  const status = useQuery(
    orpc.billing.get.queryOptions({
      input: {},
      refetchInterval: () => (Date.now() < pollUntil ? RETURN_POLL_MS : false),
    }),
  );
  const plans = useQuery(orpc.billing.plans.queryOptions({ input: {}, retry: false }));
  const credits = useQuery(
    orpc.ai.credits.balance.queryOptions({
      input: {},
      retry: false,
      enabled: can("ai.credits.read"),
    }),
  );
  const ledger = useInfiniteQuery(
    orpc.ai.credits.ledger.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 20 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: can("ai.credits.read"),
    }),
  );
  const ledgerRows = ledger.data?.pages.flatMap((p) => p.items) ?? [];

  // Coming back from Stripe: say what happened, refresh, and drop the flags from the URL.
  const returned: Notice | null = search.checkout
    ? search.mock
      ? "testCheckout"
      : search.checkout
    : search.portal === "mock"
      ? "testPortal"
      : null;
  useEffect(() => {
    if (!returned) return;
    setNotice(returned);
    if (returned === "success") setPollUntil(Date.now() + RETURN_POLL_FOR_MS);
    void queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.ai.credits.key() });
    void queryClient.invalidateQueries({ queryKey: meQueryOptions().queryKey });
    void navigate({ to: "/settings/billing", search: {}, replace: true });
  }, [returned, queryClient, navigate]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.ai.credits.key() });
    void queryClient.invalidateQueries({ queryKey: meQueryOptions().queryKey });
  };
  const redirect = (url: string) => {
    setRedirecting(true);
    window.location.assign(url);
  };

  const portal = useMutation(
    orpc.billing.portal.mutationOptions({
      meta: { silent: true },
      onSuccess: (r) => redirect(r.url),
      onError: (e) => showBillingError(e, "portal", t),
    }),
  );
  const checkout = useMutation(
    orpc.billing.checkout.mutationOptions({
      meta: { silent: true },
      onSuccess: (r) => redirect(r.url),
      onError: (e, input) => {
        // Already paying: Stripe changes an existing subscription in the billing portal.
        if (errorInfo(e).code === "CONFLICT" && "plan" in input) portal.mutate({});
        else showBillingError(e, "checkout", t);
      },
    }),
  );
  // Test mode (no Stripe): plans switch at once, as in demos. Live: only the move to free.
  const change = useMutation(
    orpc.billing.changePlan.mutationOptions({
      onSuccess: (r) => {
        if (r.checkoutUrl) return redirect(r.checkoutUrl);
        toast.success(
          r.status.cancelAtPeriodEnd && r.status.currentPeriodEnd
            ? t(
                "billing.cancelScheduled",
                "Your plan ends {{date}}. After that you're on the free plan.",
                {
                  date: formatDate(r.status.currentPeriodEnd),
                },
              )
            : t("billing.changed", "Plan changed to {{plan}}", { plan: r.status.plan.name }),
        );
        refresh();
      },
      meta: { errorTitle: t("billing.changeFailed", "Couldn't change the plan") },
    }),
  );
  const busy = checkout.isPending || portal.isPending || change.isPending || redirecting;
  const pendingInput = checkout.isPending || redirecting ? (checkout.variables ?? null) : null;
  const pendingPlan =
    pendingInput && "plan" in pendingInput
      ? pendingInput.plan
      : change.isPending
        ? change.variables?.plan
        : undefined;

  function choosePlan(key: PlanKey) {
    if (busy || !status.data) return;
    if (status.data.paymentsEnabled) checkout.mutate({ plan: key });
    else change.mutate({ plan: key });
  }
  function buyPack(key: string) {
    if (!busy) checkout.mutate({ pack: key });
  }

  const freePlan = plans.data?.items.find((p) => p.key === "trial") ?? null;
  const canGoFree =
    canManage &&
    !!status.data &&
    status.data.plan.key !== "trial" &&
    !status.data.cancelAtPeriodEnd &&
    (status.data.status === "active" || status.data.status === "past_due");

  return (
    <Page
      wide={false}
      title={t("nav.billing")}
      description={t("billing.subtitle", "Your plan, usage this period and AI credits.")}
    >
      {notice && <ReturnNotice kind={notice} onClose={() => setNotice(null)} />}
      {status.isPending ? (
        <SkeletonRows rows={6} />
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Section
            title={
              <span className="flex flex-wrap items-center gap-2">
                {status.data.plan.name}
                <Badge variant={statusVariant(status.data.status)}>
                  {t(`billingStatus.${status.data.status}`)}
                </Badge>
              </span>
            }
            description={statusLine(status.data, t)}
            actions={
              canManage && hasSubscription(status.data) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => portal.mutate({})}
                  disabled={busy}
                >
                  {portal.isPending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                  {t("billing.manage", "Manage billing")}
                </Button>
              ) : undefined
            }
          >
            <UsageMeters status={status.data} />
            <p className="mt-4 text-sm text-muted-foreground">
              {t("billing.labels", "{{n}} labels bought this period", {
                n: status.data.usage.labelsBought,
              })}{" "}
              · <Money cents={status.data.usage.labelFees} /> {t("billing.labelFees", "label fees")}
            </p>
            {!status.data.paymentsEnabled && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" aria-hidden />
                {t(
                  "billing.testModeNote",
                  "Test mode: no card is charged. Plan changes apply right away.",
                )}
              </p>
            )}
          </Section>

          <section aria-labelledby="plans-heading" className="flex flex-col gap-2">
            <h2 id="plans-heading" className="text-sm font-semibold">
              {t("billing.plansTitle", "Plans")}
            </h2>
            {plans.isPending ? (
              <SkeletonRows rows={3} />
            ) : plans.isError ? (
              <ErrorState error={plans.error} onRetry={() => void plans.refetch()} compact />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {choosablePlans(plans.data.items).map((p) => (
                  <PlanCard
                    key={p.key}
                    plan={p}
                    move={cardMove(status.data, p)}
                    canManage={canManage}
                    disabled={busy}
                    pending={pendingPlan === p.key}
                    onChoose={(move) =>
                      move === "downgrade" ? setDowngradeTo(p) : choosePlan(p.key)
                    }
                  />
                ))}
              </div>
            )}
            {canGoFree && freePlan && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {t("billing.freeHint", "Don't need a paid plan right now?")}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-1 py-0.5 text-foreground underline underline-offset-2"
                  onClick={() => setConfirmFree(true)}
                  disabled={busy}
                >
                  {change.isPending && change.variables?.plan === "trial" && (
                    <Loader2 className="animate-spin" />
                  )}
                  {t("billing.goFree", "Switch to the free plan")}
                </Button>
              </p>
            )}
          </section>

          {credits.data && (
            <Section
              title={t("billing.creditsTitle", "AI credits")}
              description={t(
                "billing.creditsLeft",
                "{{n}} left this month · {{allowance}} included with your plan, {{packs}} from packs",
                {
                  n: credits.data.remaining.toLocaleString(),
                  allowance: credits.data.allowance.toLocaleString(),
                  packs: credits.data.packs.toLocaleString(),
                },
              )}
            >
              <p className="mb-3 text-sm text-muted-foreground">
                {t(
                  "billing.packsHint",
                  "Need more this month? Buy a credit pack. It's a one-time payment, and the credits are added as soon as it goes through.",
                )}
              </p>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {CREDIT_PACKS.map((pack) => (
                    <Button
                      key={pack.key}
                      variant="outline"
                      onClick={() => buyPack(pack.key)}
                      disabled={busy}
                    >
                      {pendingInput && "pack" in pendingInput && pendingInput.pack === pack.key ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Sparkles />
                      )}
                      {t("billing.buyPack", "Buy {{n}} credits", {
                        n: pack.credits.toLocaleString(),
                      })}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("billing.ownerOnly", "Only the account owner can buy plans and credit packs.")}
                </p>
              )}
            </Section>
          )}

          {credits.data && (
            <Section
              title={t("billing.ledgerTitle", "AI credit history")}
              description={t(
                "billing.ledgerHint",
                "Every draft, assistant answer and trademark check that spent a credit.",
              )}
            >
              <CreditLedgerTable
                rows={ledgerRows}
                isLoading={ledger.isPending}
                hasMore={!!ledger.hasNextPage}
                isLoadingMore={ledger.isFetchingNextPage}
                onLoadMore={() => void ledger.fetchNextPage()}
              />
            </Section>
          )}
        </div>
      )}
      <ConfirmDialog
        open={downgradeTo !== null}
        onOpenChange={(o) => !o && setDowngradeTo(null)}
        title={t("billing.downgradeTitle", "Switch to {{plan}}?", {
          plan: downgradeTo?.name ?? "",
        })}
        description={downgradeTo ? downgradeText(downgradeTo, t) : undefined}
        confirmLabel={t("billing.downgradeConfirm", "Switch plan")}
        destructive
        pending={busy}
        onConfirm={() => {
          if (!downgradeTo) return;
          choosePlan(downgradeTo.key);
          setDowngradeTo(null);
        }}
      />
      <ConfirmDialog
        open={confirmFree}
        onOpenChange={setConfirmFree}
        title={t("billing.freeTitle", "Switch to the free plan?")}
        description={freePlan && status.data ? freeText(status.data, freePlan, t) : undefined}
        confirmLabel={t("billing.freeConfirm", "Switch to free")}
        destructive
        pending={change.isPending}
        onConfirm={() => {
          change.mutate({ plan: "trial" });
          setConfirmFree(false);
        }}
      />
    </Page>
  );
}

function showBillingError(err: unknown, action: "checkout" | "portal", t: T) {
  const msg = billingActionError(err, action, t);
  if (msg) toast.error(msg.title);
}

function hasSubscription(s: BillingStatus): boolean {
  return s.status === "active" || s.status === "past_due" || s.status === "cancelled";
}

/** Without an active paid plan (trial, trial ended, cancelled), every plan is a fresh choice. */
function cardMove(s: BillingStatus, target: Plan): PlanMove | "choose" {
  const needsPlan =
    s.plan.key === "trial" || s.status === "trial_expired" || s.status === "cancelled";
  if (isCustomPlan(target)) return target.key === s.plan.key && !needsPlan ? "current" : "custom";
  if (needsPlan) return "choose";
  return planMove(s.plan, target);
}

function statusVariant(s: BillingStatus["status"]) {
  switch (s) {
    case "active":
      return "success" as const;
    case "trialing":
      return "info" as const;
    case "cancelled":
      return "secondary" as const;
    default:
      return "danger" as const;
  }
}

function statusLine(s: BillingStatus, t: T): string {
  switch (s.status) {
    case "trialing":
      if (!s.trialEndsAt) return t("billing.trialNoEnd", "Free trial");
      return t("billing.trialEndsIn", "Free trial ends {{date}} ({{n}} days left)", {
        date: formatDate(s.trialEndsAt),
        n: daysUntil(s.trialEndsAt),
      });
    case "trial_expired":
      return s.trialEndsAt
        ? t("billing.trialEnded", "Your free trial ended {{date}}. Choose a plan to keep going.", {
            date: formatDate(s.trialEndsAt),
          })
        : t("billing.trialEndedNoDate", "Your free trial has ended. Choose a plan to keep going.");
    case "past_due":
      return t(
        "billing.pastDue",
        "Your last payment didn't go through. Update your card in Manage billing.",
      );
    case "cancelled":
      return t("billing.cancelled", "Your plan is cancelled. Choose a plan to start again.");
    case "active":
      if (s.currentPeriodEnd && s.cancelAtPeriodEnd)
        return t("billing.endsOn", "Ends {{date}}. It won't renew.", {
          date: formatDate(s.currentPeriodEnd),
        });
      if (s.currentPeriodEnd)
        return t("billing.renewsOn", "Renews {{date}}", { date: formatDate(s.currentPeriodEnd) });
      return t("billing.period", "Period {{from}} – {{to}}", {
        from: formatDate(s.usage.periodStart),
        to: formatDate(s.usage.periodEnd),
      });
  }
}

function CreditLedgerTable({
  rows,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  rows: CreditEntry[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  const columns: DataTableColumn<CreditEntry>[] = [
    {
      accessorKey: "at",
      header: t("billing.ledgerWhen", "When"),
      cell: ({ row }) => <RelativeTime value={row.original.at} className="text-muted-foreground" />,
    },
    {
      accessorKey: "kind",
      header: t("billing.ledgerKind", "Kind"),
      cell: ({ row }) => (
        <Badge variant="secondary">
          {t(`creditKind.${row.original.kind}`, row.original.kind.replace(/_/g, " "))}
        </Badge>
      ),
    },
    {
      id: "model",
      header: t("billing.ledgerModel", "Model"),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.model ?? "—"}</span>,
    },
    {
      id: "tokens",
      header: t("billing.ledgerTokens", "Tokens"),
      cell: ({ row }) => {
        const r = row.original;
        return r.tokensIn == null ? (
          "—"
        ) : (
          <span className="tabular-nums text-muted-foreground">
            {r.tokensIn.toLocaleString()} in / {(r.tokensOut ?? 0).toLocaleString()} out
          </span>
        );
      },
    },
    {
      accessorKey: "credits",
      header: t("billing.ledgerCredits", "Credits"),
      cell: ({ row }) => (
        <span
          className={cn(
            "tabular-nums font-medium",
            row.original.credits < 0 ? "text-danger" : "text-success",
          )}
        >
          {row.original.credits > 0 ? "+" : ""}
          {row.original.credits.toLocaleString()}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns as DataTableColumn<CreditEntry, unknown>[]}
      data={rows}
      getRowId={(r) => r.id}
      isLoading={isLoading}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onLoadMore={onLoadMore}
      emptyTitle={t("billing.ledgerEmpty", "No AI credit activity yet")}
      maxHeight="24rem"
    />
  );
}

function UsageMeters({ status }: { status: BillingStatus }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["orders", "aiCredits", "users", "connections"] as const).map((k) => {
        const m = status.usage[k];
        const label = t(`billing.meter.${k}`);
        const pct = Math.min(100, Math.round((m.ratio ?? 0) * 100));
        return (
          <div key={k}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span>{label}</span>
              <span className={cn("tabular-nums", m.limitReached && "font-medium text-danger")}>
                {m.used.toLocaleString()} / {m.limit === null ? "∞" : m.limit.toLocaleString()}
                {m.limitReached && ` · ${t("billing.limitReached", "limit reached")}`}
              </span>
            </div>
            <Progress
              value={pct}
              aria-label={label}
              className={cn(m.limitReached && "[&>div]:bg-danger")}
            />
          </div>
        );
      })}
    </div>
  );
}

function PlanCard({
  plan,
  move,
  canManage,
  disabled,
  pending,
  onChoose,
}: {
  plan: Plan;
  move: PlanMove | "choose";
  canManage: boolean;
  disabled: boolean;
  pending: boolean;
  onChoose: (move: PlanMove | "choose") => void;
}) {
  const { t } = useTranslation();
  const custom = isCustomPlan(plan);
  const label =
    move === "upgrade"
      ? t("billing.upgrade", "Upgrade")
      : move === "downgrade"
        ? t("billing.downgrade", "Downgrade")
        : t("billing.choose", "Choose {{plan}}", { plan: plan.name });
  return (
    <Card className={cn("flex flex-col gap-2 p-4", move === "current" && "border-primary")}>
      <p className="font-semibold">{plan.name}</p>
      <p className="text-2xl font-semibold">
        {custom ? (
          <span className="text-lg">{t("billing.customPrice", "Custom price")}</span>
        ) : (
          <>
            <Money cents={plan.priceMonthly} />
            <span className="text-sm font-normal text-muted-foreground">
              /{t("billing.month", "mo")}
            </span>
          </>
        )}
      </p>
      <ul className="flex-1 text-sm text-muted-foreground">
        <li>
          {plan.ordersPerMonth === null
            ? t("billing.unlimited", "Unlimited orders")
            : t("billing.orders", "{{n}} orders/mo", { n: plan.ordersPerMonth.toLocaleString() })}
        </li>
        <li>
          {t("billing.credits", "{{n}} AI credits", { n: plan.aiCreditsPerMonth.toLocaleString() })}
        </li>
        <li>
          {plan.maxUsers === null
            ? t("billing.anyUsers", "Unlimited users")
            : t("billing.users", "{{n}} users", { n: plan.maxUsers })}
        </li>
        <li>
          {plan.maxConnections === null
            ? t("billing.anyStores", "Unlimited channel connections")
            : t("billing.stores", "{{n}} channel connections", { n: plan.maxConnections })}
        </li>
        <li>
          <Money cents={plan.labelFee} /> {t("billing.perLabel", "per label")}
        </li>
      </ul>
      {move === "current" ? (
        <Badge variant="secondary" className="self-start">
          {t("billing.current", "Current plan")}
        </Badge>
      ) : move === "custom" ? (
        <p className="text-xs text-muted-foreground">
          {t("billing.contactUs", "Contact us to set up this plan.")}
        </p>
      ) : (
        canManage && (
          <Button
            variant={move === "downgrade" ? "outline" : "default"}
            size="sm"
            onClick={() => onChoose(move)}
            disabled={disabled}
          >
            {pending && <Loader2 className="animate-spin" />}
            {label}
          </Button>
        )
      )}
    </Card>
  );
}

function downgradeText(plan: Plan, t: T): string {
  return t(
    "billing.downgradeBody",
    "{{plan}} includes {{orders}} orders a month, {{users}} users and {{stores}} channel connections. If you use more than that, imports, invites or new connections stop until you upgrade again.",
    {
      plan: plan.name,
      orders:
        plan.ordersPerMonth === null
          ? t("billing.unlimitedShort", "unlimited")
          : plan.ordersPerMonth.toLocaleString(),
      users: plan.maxUsers ?? t("billing.unlimitedShort", "unlimited"),
      stores: plan.maxConnections ?? t("billing.unlimitedShort", "unlimited"),
    },
  );
}

/** Moving to free: a paying plan runs to the end of its period first (live), or changes now. */
function freeText(s: BillingStatus, free: Plan, t: T): string {
  const limits = {
    orders: free.ordersPerMonth?.toLocaleString() ?? t("billing.unlimitedShort", "unlimited"),
    users: free.maxUsers ?? t("billing.unlimitedShort", "unlimited"),
    stores: free.maxConnections ?? t("billing.unlimitedShort", "unlimited"),
  };
  if (s.paymentsEnabled && s.currentPeriodEnd)
    return t(
      "billing.freeBodyLater",
      "You keep {{plan}} until {{date}}. Then you move to the free plan: {{orders}} orders a month, {{users}} users and {{stores}} channel connections.",
      { plan: s.plan.name, date: formatDate(s.currentPeriodEnd), ...limits },
    );
  return t(
    "billing.freeBodyNow",
    "You move to the free plan now: {{orders}} orders a month, {{users}} users and {{stores}} channel connections.",
    limits,
  );
}

function ReturnNotice({ kind, onClose }: { kind: Notice; onClose: () => void }) {
  const { t } = useTranslation();
  const ok = kind === "success";
  const text =
    kind === "success"
      ? t(
          "billing.returnSuccess",
          "Thanks, your payment went through. Your plan and credits update here in a few seconds.",
        )
      : kind === "cancel"
        ? t("billing.returnCancel", "Checkout was cancelled. Nothing was charged.")
        : kind === "testCheckout"
          ? t(
              "billing.returnTest",
              "Test checkout finished. In test mode nothing is charged, so your plan and credits stay the same.",
            )
          : t("billing.returnTestPortal", "Test mode: there's no card or invoice to manage yet.");
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-start gap-3 rounded-lg border px-3 py-2 text-sm",
        ok ? "border-success/40 bg-success/10" : "border-border bg-muted/40",
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <p className="min-w-0 flex-1">{text}</p>
      <Button
        size="icon"
        variant="ghost"
        className="-my-1 size-8"
        aria-label={t("action.close")}
        onClick={onClose}
      >
        <X />
      </Button>
    </div>
  );
}

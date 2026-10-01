import type { Alert, AlertMessageCode, AlertParams, TodaySummary } from "@invai/contracts";
import { Button, cn, EmptyState, Progress, RelativeTime, Skeleton, StatCard } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  FileUp,
  Info,
  Layers,
  PackageMinus,
  Tag,
  Truck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnyLink } from "../../components/any-link";
import { DigestTodayCard } from "../../components/digest/today-card";
import { Page, Section } from "../../components/page";
import { ErrorState, SkeletonRows } from "../../components/states";
import { isOwnDemo } from "../../features/demo/is-own-demo";
import { OnboardingChecklist } from "../../features/onboarding/checklist";
import { TodayActionsPanel } from "../../features/today/actions-panel";
import { firstName, orderLabel } from "../../lib/format";
import { useCan, useMe } from "../../lib/me";
import { orpc } from "../../lib/rpc";

export const Route = createFileRoute("/_app/")({
  component: TodayPage,
});

/**
 * B-225: the greeting's date must follow the UI language, never the runtime's default locale
 * (`toLocaleDateString(undefined, ...)`; `lib/format.ts`'s private `dateLocale()` has the same
 * rule but isn't exported, so this is its own copy, digest-copy.ts's precedent for files this
 * card doesn't own).
 */
function greetingDateLocale(lang: string): string {
  return lang.startsWith("es") ? "es-MX" : "en-US";
}

function TodayPage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const can = useCan();
  const summary = useQuery(orpc.today.summary.queryOptions({ input: {}, refetchInterval: 60_000 }));
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("today.morning", "Good morning")
      : hour < 18
        ? t("today.afternoon", "Good afternoon")
        : t("today.evening", "Good evening");
  const todayDate = new Date().toLocaleDateString(greetingDateLocale(i18n.language), {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Page
      title={t("nav.today")}
      description={`${greeting}, ${firstName(me.user.name)}. ${todayDate}`}
      actions={<QuickActions />}
    >
      <div className="flex flex-col gap-4">
        {me.onboarding && <OnboardingChecklist checklist={me.onboarding} isDemo={isOwnDemo(me)} />}
        {can("finance.read") && <DigestTodayCard />}
        {/* AC-E2/AC-E5: finance.read-gated here, like DigestTodayCard, so the query never fires
        for a role without it and a refusal never breaks Today for everyone else. */}
        {can("finance.read") && <TodayActionsPanel />}
        {summary.isError ? (
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        ) : (
          <>
            <StatGrid data={summary.data} />
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="flex flex-col gap-4 lg:col-span-3">
                <StationWork data={summary.data} />
                <Pipeline data={summary.data} />
              </div>
              <div className="lg:col-span-2">{can("alerts.read") && <AlertsPanel />}</div>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

function QuickActions() {
  const { t } = useTranslation();
  const can = useCan();
  return (
    <div className="flex flex-wrap gap-2">
      {can("production.build") && (
        <Button size="sm" asChild>
          <Link to="/production/sheets" search={{ build: true }}>
            <Layers />
            {t("today.buildSheets", "Build sheets")}
          </Link>
        </Button>
      )}
      {can("channels.import") && (
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings/channels" search={{ import: true }}>
            <FileUp />
            {t("today.importCsv", "Import CSV")}
          </Link>
        </Button>
      )}
      {can("shipping.buy") && (
        <Button size="sm" variant="outline" asChild>
          <Link to="/shipping">
            <Tag />
            {t("today.buyLabels", "Buy labels")}
          </Link>
        </Button>
      )}
    </div>
  );
}

function StatGrid({ data }: { data: TodaySummary | undefined }) {
  const { t } = useTranslation();
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          <Skeleton key={i} className="h-[104px]" />
        ))}
      </div>
    );
  }
  const blocked = data.blocked.needsMapping + data.blocked.needsArtwork;
  const cards = [
    {
      label: t("today.dueToday", "Due today"),
      value: data.orders.dueToday,
      icon: CalendarClock,
      tone: "info" as const,
      to: "/orders",
      search: { view: "due_today" },
    },
    {
      label: t("today.overdue", "Overdue"),
      value: data.orders.overdue,
      icon: AlertOctagon,
      tone: data.orders.overdue > 0 ? ("danger" as const) : ("neutral" as const),
      to: "/orders",
      search: { view: "overdue" },
    },
    {
      label: t("today.atRisk", "At risk"),
      value: data.orders.atRisk,
      icon: Clock,
      tone: data.orders.atRisk > 0 ? ("warning" as const) : ("neutral" as const),
      to: "/orders",
      search: { view: "at_risk" },
    },
    {
      label: t("today.blocked", "Blocked"),
      value: blocked,
      icon: Ban,
      tone: blocked > 0 ? ("warning" as const) : ("neutral" as const),
      to: "/orders",
      search: { view: "blocked" },
      hint: t("today.blockedHint", "{{m}} mapping · {{a}} artwork", {
        m: data.blocked.needsMapping,
        a: data.blocked.needsArtwork,
      }),
    },
    {
      label: t("today.onVendor", "On vendor"),
      value: data.sheets.waitingOnVendor,
      icon: Truck,
      tone: "neutral" as const,
      to: "/production/sheets",
      search: {},
      hint: t("today.sheetsReady", "{{n}} sheets ready to send", { n: data.sheets.ready }),
    },
    {
      label: t("today.lowStock", "Low stock"),
      value: data.inventory.lowStockCount,
      icon: PackageMinus,
      tone: data.inventory.lowStockCount > 0 ? ("warning" as const) : ("neutral" as const),
      to: "/inventory/stock",
      search: { low: true },
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <AnyLink
          key={c.label}
          to={c.to}
          search={c.search}
          className="relative rounded-lg outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatCard
            label={c.label}
            value={c.value.toLocaleString()}
            icon={c.icon}
            tone={c.tone}
            className={cn("h-full", c.hint && "pb-12")}
          />
          {c.hint && (
            <span className="absolute inset-x-4 bottom-3 line-clamp-2 text-xs text-muted-foreground">
              {c.hint}
            </span>
          )}
        </AnyLink>
      ))}
    </div>
  );
}

function StationWork({ data }: { data: TodaySummary | undefined }) {
  const { t } = useTranslation();
  return (
    <Section
      title={t("today.workByStation", "Work by station")}
      description={t("today.workByStationHint", "Waiting now vs. finished today")}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/production/stations">{t("today.openBoard", "Open board")}</Link>
        </Button>
      }
    >
      {!data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.stations.map((s) => {
            const total = Math.max(1, s.itemsWaiting + s.itemsDoneToday);
            return (
              <div
                key={s.station}
                className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm"
              >
                <span className="font-medium">{t(`station.${s.station}`)}</span>
                <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className="bg-success"
                    style={{ width: `${(s.itemsDoneToday / total) * 100}%` }}
                  />
                  <div
                    className="bg-warning"
                    style={{ width: `${(s.itemsWaiting / total) * 100}%` }}
                  />
                </div>
                <span className="tabular-nums text-muted-foreground">
                  <span className="text-foreground">{s.itemsWaiting}</span>{" "}
                  {t("today.waiting", "waiting")} · {s.itemsDoneToday} {t("today.done", "done")}
                </span>
              </div>
            );
          })}
          <Capacity data={data} />
        </div>
      )}
    </Section>
  );
}

function Capacity({ data }: { data: TodaySummary }) {
  const { t } = useTranslation();
  const { capacityItems, workloadItems, hoursLeft, itemsPerHour } = data.capacity;
  const ratio = capacityItems > 0 ? workloadItems / capacityItems : workloadItems > 0 ? 2 : 0;
  const over = ratio > 1;
  return (
    <div className="mt-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t("today.capacity", "Today's capacity")}</span>
        <span className={cn("tabular-nums", over ? "text-danger" : "text-muted-foreground")}>
          {t("today.capacityValue", "{{work}} of {{cap}} items", {
            work: workloadItems,
            cap: capacityItems,
          })}
        </span>
      </div>
      <Progress
        value={Math.min(100, ratio * 100)}
        className={cn("mt-2", over && "[&>div]:bg-danger")}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {over
          ? t(
              "today.overCapacity",
              "More work due today than the team can finish. Consider rushing or holding.",
            )
          : t("today.capacityHint", "{{rate}} items/hour · {{hours}} h left", {
              rate: itemsPerHour.toFixed(0),
              hours: hoursLeft.toFixed(1),
            })}
      </p>
    </div>
  );
}

function Pipeline({ data }: { data: TodaySummary | undefined }) {
  const { t } = useTranslation();
  if (!data) return <Skeleton className="h-28" />;
  const rows: [string, number, string, Record<string, unknown>][] = [
    [
      t("today.needsMapping", "Needs SKU mapping"),
      data.blocked.needsMapping,
      "/catalog/sku-mapping",
      {},
    ],
    [
      t("today.needsArtwork", "Needs artwork review"),
      data.blocked.needsArtwork,
      "/orders",
      { view: "needs_artwork" },
    ],
    [t("today.onHold", "On hold"), data.orders.onHold, "/orders", { view: "on_hold" }],
    [
      t("today.sheetsReadyToSend", "Sheets ready to send"),
      data.sheets.ready,
      "/production/sheets",
      {},
    ],
    [
      t("today.printedNotReceived", "Transfers in transit"),
      data.sheets.printedNotReceived,
      "/production/sheets",
      {},
    ],
    [
      t("today.packedUnlabeled", "Packed, no label"),
      data.shipping.packedUnlabeled,
      "/shipping",
      {},
    ],
    [
      t("today.trackingFailed", "Tracking push failed"),
      data.shipping.trackingPushFailed,
      "/shipping",
      { tab: "shipments" },
    ],
  ];
  return (
    <Section title={t("today.pipeline", "Needs attention")}>
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {rows.map(([label, n, to, search]) => (
          <li key={label}>
            <AnyLink
              to={to}
              search={search}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className={cn(n === 0 && "text-muted-foreground")}>{label}</span>
              <span className={cn("tabular-nums font-medium", n === 0 && "text-muted-foreground")}>
                {n}
              </span>
            </AnyLink>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const SEVERITY_ICON = { info: Info, warning: AlertTriangle, critical: AlertOctagon } as const;
const SEVERITY_CLASS = {
  info: "text-info",
  warning: "text-warning",
  critical: "text-danger",
} as const;

/** The alert's headline in the reader's language, from its kind (the backend text is English). */
function alertKindLabel(t: TFunction, kind: Alert["kind"]): string {
  switch (kind) {
    case "order_at_risk":
      return t("alerts.kind.order_at_risk", "Order at risk of shipping late");
    case "order_overdue":
      return t("alerts.kind.order_overdue", "Order past its ship-by date");
    case "sync_broken":
      return t("alerts.kind.sync_broken", "Store connection stopped syncing");
    case "sheet_stuck":
      return t("alerts.kind.sheet_stuck", "Gang sheet waiting on the vendor");
    case "stock_low":
      return t("alerts.kind.stock_low", "Low stock");
    case "artwork_flagged":
      return t("alerts.kind.artwork_flagged", "Artwork needs review");
    case "items_need_mapping":
      return t("alerts.kind.items_need_mapping", "Items need SKU mapping");
    case "tracking_push_failed":
      return t("alerts.kind.tracking_push_failed", "Tracking didn't reach the marketplace");
    case "plan_limit_reached":
      return t("alerts.kind.plan_limit_reached", "Plan limit reached");
    case "ai_credits_low":
      return t("alerts.kind.ai_credits_low", "AI credits running low");
    case "vendor_sheet_received":
      return t("alerts.kind.vendor_sheet_received", "New gang sheet from a shop");
    case "qc_fail_spike":
      return t("alerts.kind.qc_fail_spike", "More QC fails than usual");
    case "ai_spend_cap_tenant":
      return t("alerts.kind.ai_spend_cap_tenant", "Daily AI spend cap reached");
    case "ai_spend_cap_platform":
      return t("alerts.kind.ai_spend_cap_platform", "Platform-wide AI spend cap reached");
    case "queue_failed_spike":
      return t("alerts.kind.queue_failed_spike", "Background work is failing more than usual");
    case "outbox_parked":
      return t("alerts.kind.outbox_parked", "A background step was set aside");
    case "ai_breaker_fail_open":
      return t("alerts.kind.ai_breaker_fail_open", "AI spend check was skipped");
    case "ai_summary_breaker":
      return t("alerts.kind.ai_summary_breaker", "AI weekly summaries paused");
  }
}

/** A ship-by or sent-at date in the shop's own time zone (B-137), in the active language. */
export function alertDateLabel(
  iso: string,
  timeZone: string | undefined,
  language: string,
): string {
  try {
    return new Intl.DateTimeFormat(language.startsWith("es") ? "es-MX" : "en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** A translated word's first letter lowercased, for mid-sentence use ("still sent" not "still Sent"). */
function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * 0.11.0 (ruling R1, waves/P5/reviews/plan-architect.md): the translated line per `messageCode`,
 * keyed by a Record (never an exhaustive switch) so a future code this build doesn't know yet
 * falls through to the title-only fallback instead of a type error or a thrown switch.
 */
const ALERT_LINE_BUILDERS: Partial<
  Record<AlertMessageCode, (t: TFunction, p: AlertParams, language: string) => string>
> = {
  order_at_risk: (t, p, language) =>
    t("alerts.line.order_at_risk", "Order {{orderNo}} ships within {{count}} hour, due {{date}}.", {
      orderNo: orderLabel(p.orderNo ?? ""),
      count: p.hours ?? 0,
      date: p.shipBy ? alertDateLabel(p.shipBy, p.timeZone, language) : "",
    }),
  order_overdue: (t, p, language) =>
    t(
      "alerts.line.order_overdue",
      "Order {{orderNo}} was due {{date}} and still has no shipping label.",
      {
        orderNo: orderLabel(p.orderNo ?? ""),
        date: p.shipBy ? alertDateLabel(p.shipBy, p.timeZone, language) : "",
      },
    ),
  sync_broken: (t, p) =>
    t(
      "alerts.line.sync_broken",
      "{{connectionName}} has been failing to sync for more than 30 minutes.",
      { connectionName: p.connectionName ?? "" },
    ),
  sheet_stuck: (t, p) =>
    t("alerts.line.sheet_stuck", "Sheet {{sheetName}} sent {{count}} hour ago, still {{status}}.", {
      sheetName: p.sheetName ?? "",
      count: p.hours ?? 0,
      status: p.sheetStatus ? lowerFirst(t(`sheetState.${p.sheetStatus}`, p.sheetStatus)) : "",
    }),
  stock_low: (t, p) =>
    t(
      "alerts.line.stock_low",
      "{{blankName}}: {{available}} available, reorder point {{reorderPoint}}, {{incoming}} incoming.",
      {
        blankName: p.blankName ?? "",
        available: p.available ?? 0,
        reorderPoint: p.reorderPoint ?? 0,
        incoming: p.incoming ?? 0,
      },
    ),
  plan_limit_near: (t, p) =>
    t(
      "alerts.line.plan_limit_near",
      "{{usedPct}}% of monthly orders used: {{used}} of {{limit}} on the {{planName}} plan.",
      {
        usedPct: p.usedPct ?? 0,
        used: p.used ?? 0,
        limit: p.limit ?? 0,
        planName: p.planName ?? "",
      },
    ),
  plan_limit_reached: (t, p) =>
    t(
      "alerts.line.plan_limit_reached",
      "{{used}} of {{limit}} orders used on the {{planName}} plan this month.",
      { used: p.used ?? 0, limit: p.limit ?? 0, planName: p.planName ?? "" },
    ),
  label_buy_stuck: (t) =>
    t(
      "alerts.line.label_buy_stuck",
      "We couldn't confirm a label purchase with the carrier after several tries. Open the shipment and buy the label again; you won't be charged twice.",
    ),
  label_void_stuck: (t) =>
    t(
      "alerts.line.label_void_stuck",
      "We couldn't confirm a label void with the carrier. Open the shipment and void it again, or contact the carrier about the refund.",
    ),
  tracking_push_stuck: (t) =>
    t(
      "alerts.line.tracking_push_stuck",
      "We couldn't confirm the tracking upload to the channel after several tries. Open the tracking list and retry it.",
    ),
  vendor_email_unconfirmed: (t, p) =>
    t(
      "alerts.line.vendor_email_unconfirmed",
      "Sheet {{sheetName}}: we couldn't confirm the email to {{vendorName}} was sent. Open the sheet and resend it.",
      { sheetName: p.sheetName ?? "", vendorName: p.vendorName ?? "" },
    ),
  vendor_email_failed: (t, p) =>
    t(
      "alerts.line.vendor_email_failed",
      "Sheet {{sheetName}}: the email to {{vendorName}} didn't go out. Check their address, then resend it.",
      { sheetName: p.sheetName ?? "", vendorName: p.vendorName ?? "" },
    ),
  po_stuck_submitting: (t, p) =>
    t(
      "alerts.line.po_stuck_submitting",
      "{{poNo}} has been stuck sending to {{supplierName}} for over 15 minutes.",
      { poNo: p.poNo ?? "", supplierName: p.supplierName ?? "" },
    ),
  webhook_stuck: (t, p) =>
    t(
      "alerts.line.webhook_stuck",
      "An update from {{channel}} wasn't processed. Run a sync on the connection to pick it up.",
      { channel: p.channel ? t(`channel.${p.channel}`, p.channel) : "" },
    ),
};

/**
 * The specifics under the headline. With a known `messageCode` + `params` (0.11.0, B-224), the
 * line is translated from them, in English and Spanish. Without one (old rows, worker/AI alerts),
 * today's behavior stays: the backend's English title and message, joined only in English.
 */
export function alertDetail(t: TFunction, a: Alert, language: string): string {
  if (a.messageCode && a.params) {
    const line = ALERT_LINE_BUILDERS[a.messageCode]?.(t, a.params, language);
    if (line) return line;
  }
  return language.startsWith("en") && a.message ? `${a.title} · ${a.message}` : a.title;
}

function alertLink(a: Alert): { to: string; search?: Record<string, unknown> } | null {
  if (!a.entity) return null;
  switch (a.entity.type) {
    case "order":
      return { to: "/orders", search: { order: a.entity.id } };
    case "gang_sheet":
    case "sheet":
      return { to: `/production/sheets/${a.entity.id}` };
    case "blank_variant":
      return { to: "/inventory/stock", search: { low: true } };
    case "connection":
      return { to: "/settings/channels" };
    default:
      return null;
  }
}

function AlertsPanel() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const alerts = useQuery(orpc.alerts.list.queryOptions({ input: { limit: 12 } }));
  const markAll = useMutation(
    orpc.alerts.markAllRead.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.alerts.key() }),
    }),
  );
  const markOne = useMutation(
    orpc.alerts.markRead.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.alerts.key() }),
    }),
  );
  return (
    <Section
      className="h-full"
      title={
        <span id="alerts" className="scroll-mt-20">
          {t("today.alerts", "Alerts")}
        </span>
      }
      actions={
        (alerts.data?.unread ?? 0) > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAll.mutate({})}
            disabled={markAll.isPending}
          >
            <Check />
            {t("today.markAllRead", "Mark all read")}
          </Button>
        )
      }
    >
      {alerts.isPending ? (
        <SkeletonRows rows={5} />
      ) : alerts.isError ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} compact />
      ) : alerts.data.items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={t("today.noAlerts", "All clear")}
          description={t("today.noAlertsHint", "Nothing needs you right now.")}
          className="py-8"
        />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {alerts.data.items.map((a) => {
            const Icon = SEVERITY_ICON[a.severity];
            const link = alertLink(a);
            const body = (
              <>
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", SEVERITY_CLASS[a.severity])}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", a.readAt ? "text-muted-foreground" : "font-medium")}>
                    {alertKindLabel(t, a.kind)}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {alertDetail(t, a, i18n.language)}
                  </p>
                </div>
                <RelativeTime
                  value={a.createdAt}
                  className="shrink-0 text-xs text-muted-foreground"
                />
              </>
            );
            const onOpen = () => {
              if (!a.readAt) markOne.mutate({ ids: [a.id] });
            };
            return (
              <li key={a.id}>
                {link ? (
                  <AnyLink
                    to={link.to}
                    search={link.search}
                    onClick={onOpen}
                    className="flex gap-3 rounded-md px-2 py-2 hover:bg-accent"
                  >
                    {body}
                  </AnyLink>
                ) : (
                  <button
                    type="button"
                    onClick={onOpen}
                    className="flex w-full gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

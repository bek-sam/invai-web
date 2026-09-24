import type { Alert, TodaySummary } from "@invai/contracts";
import { Button, cn, EmptyState, Progress, RelativeTime, Skeleton, StatCard } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
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
import { Page, Section } from "../../components/page";
import { ErrorState, SkeletonRows } from "../../components/states";
import { useCan, useMe } from "../../lib/me";
import { orpc } from "../../lib/rpc";

export const Route = createFileRoute("/_app/")({
  component: TodayPage,
});

function TodayPage() {
  const { t } = useTranslation();
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

  return (
    <Page
      title={t("nav.today")}
      description={`${greeting}, ${me.user.name.split(" ")[0]}. ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
      actions={<QuickActions />}
    >
      <div className="flex flex-col gap-4">
        {me.onboarding && <Onboarding checklist={me.onboarding} />}
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
      search: { view: "all" },
    },
    {
      label: t("today.overdue", "Overdue"),
      value: data.orders.overdue,
      icon: AlertOctagon,
      tone: data.orders.overdue > 0 ? ("danger" as const) : ("neutral" as const),
      to: "/orders",
      search: { view: "at_risk" },
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
      search: { view: "needs_mapping" },
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
          className="rounded-lg outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatCard
            label={c.label}
            value={c.value.toLocaleString()}
            icon={c.icon}
            tone={c.tone}
            className="h-full"
          />
          {c.hint && <span className="sr-only">{c.hint}</span>}
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
  const { t } = useTranslation();
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
                    {a.title}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{a.message}</p>
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

function Onboarding({
  checklist,
}: {
  checklist: NonNullable<ReturnType<typeof useMe>["onboarding"]>;
}) {
  const { t } = useTranslation();
  const steps = [
    {
      done: checklist.channelConnected,
      label: t("onboarding.channel", "Connect a sales channel or import a CSV"),
      to: "/settings/channels",
    },
    {
      done: checklist.blanksImported,
      label: t("onboarding.blanks", "Import your blanks"),
      to: "/catalog/blanks",
    },
    {
      done: checklist.skusMapped,
      label: t("onboarding.skus", "Map your SKUs to designs and blanks"),
      to: "/catalog/sku-mapping",
    },
    {
      done: checklist.vendorAdded,
      label: t("onboarding.vendor", "Add your DTF vendor"),
      to: "/settings/vendors",
    },
    {
      done: checklist.staffInvited,
      label: t("onboarding.staff", "Invite your team"),
      to: "/settings/team",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  return (
    <Section
      title={t("onboarding.title", "Get set up")}
      description={t("onboarding.progress", "{{done}} of {{total}} done", {
        done: doneCount,
        total: steps.length,
      })}
    >
      <Progress value={(doneCount / steps.length) * 100} className="mb-3" />
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.to}>
            <AnyLink
              to={s.to}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              {s.done ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
              <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
            </AnyLink>
          </li>
        ))}
      </ul>
    </Section>
  );
}

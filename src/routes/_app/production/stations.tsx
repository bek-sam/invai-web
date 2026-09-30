import { MAINTENANCE_REASONS, STATIONS, type Station, type StationDevice } from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  RelativeTime,
  Skeleton,
  Textarea,
  toast,
} from "@invai/ui";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, PauseCircle, Radio, ScanLine, Wrench, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { lastNDays, orderLabel } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import {
  type RealtimeMessage,
  useRealtimeListener,
  useRealtimeStatus,
} from "../../../lib/realtime";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/production/stations")({
  component: StationsBoard,
});

interface ScanFeedEntry {
  id: string;
  at: string;
  station: Station;
  ok: boolean;
  orderNo: string | null;
  mismatch: string | null;
}

function StationsBoard() {
  const { t } = useTranslation();
  const rt = useRealtimeStatus();
  const queues = useQueries({
    queries: STATIONS.map((station) =>
      orpc.production.queue.queryOptions({ input: { station, limit: 5 }, refetchInterval: 30_000 }),
    ),
  });
  const [feed, setFeed] = useState<ScanFeedEntry[]>([]);
  useRealtimeListener(
    useCallback((m: RealtimeMessage) => {
      if (m.name !== "scan.result") return;
      const p = m.payload;
      setFeed((prev) =>
        [
          {
            id: String(p.clientScanId ?? m.id ?? Math.random()),
            at: m.at,
            station: (p.station as Station) ?? "press",
            ok: !!p.ok,
            orderNo: (p.orderNo as string | null) ?? null,
            mismatch: (p.mismatch as string | null) ?? null,
          },
          ...prev.filter((e) => e.id !== String(p.clientScanId)),
        ].slice(0, 60),
      );
    }, []),
  );
  // Fixed for the life of the page: a fresh `to` on every render would change the query key
  // (and refetch) on every SSE update.
  const [today] = useState(() => lastNDays(1));
  const output = useQuery(
    orpc.production.staffOutput.queryOptions({ input: today, refetchInterval: 60_000 }),
  );

  return (
    <Page
      title={t("nav.stationsBoard")}
      description={
        <span className="inline-flex items-center gap-1.5">
          <Radio
            className={cn("size-3.5", rt === "open" ? "text-success" : "text-muted-foreground")}
          />
          {rt === "open"
            ? t("stations.live", "Live")
            : t("stations.reconnecting", "Reconnecting to live updates…")}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATIONS.map((station, i) => {
          const q = queues[i];
          return (
            <Card key={station} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t(`station.${station}`)}</p>
                <ScanLine className="size-4 text-muted-foreground" />
              </div>
              {!q || q.isPending ? (
                <Skeleton className="mt-3 h-10" />
              ) : q.isError ? (
                <ErrorState
                  error={q.error}
                  compact
                  className="mt-3"
                  onRetry={() => void q.refetch()}
                />
              ) : (
                <>
                  <p className="mt-2 text-3xl font-semibold tabular-nums">
                    {q.data.counts.waiting}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("stations.waitingDone", "waiting · {{done}} done today", {
                      done: q.data.counts.doneToday,
                    })}
                  </p>
                  {q.data.items.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-2 text-xs">
                      {q.data.items.map((it) => (
                        <li key={it.orderItemId} className="flex items-center gap-1.5">
                          <Link
                            to="/orders"
                            search={{ order: it.orderId }}
                            className="truncate font-medium hover:underline"
                          >
                            {orderLabel(it.orderNo)}
                          </Link>
                          <span className="truncate text-muted-foreground">{it.design.name}</span>
                          {it.isRush && (
                            <Badge variant="danger" className="ml-auto px-1.5">
                              {t("orders.rush", "Rush")}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
      <div className="mt-4">
        <StationMaintenancePanel />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Section
          className="lg:col-span-3"
          title={t("stations.recentScans", "Recent scans")}
          description={t("stations.recentScansHint", "Streams in as the floor scans")}
        >
          {feed.length === 0 ? (
            <EmptyState
              icon={ScanLine}
              title={t("stations.noScans", "Waiting for scans")}
              description={t("stations.noScansHint", "Scans from floor tablets appear here live.")}
              className="py-10"
            />
          ) : (
            <ul className="-my-2 max-h-[50vh] divide-y divide-border overflow-y-auto">
              {feed.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  {e.ok ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <XCircle className="size-4 text-danger" />
                  )}
                  <span className="w-16 text-muted-foreground">{t(`station.${e.station}`)}</span>
                  <span className="font-medium">{e.orderNo ? orderLabel(e.orderNo) : "—"}</span>
                  {!e.ok && e.mismatch && (
                    <span className="text-danger">
                      {t(`mismatch.${e.mismatch}`, e.mismatch.replace(/_/g, " "))}
                    </span>
                  )}
                  <RelativeTime value={e.at} className="ml-auto text-xs text-muted-foreground" />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section className="lg:col-span-2" title={t("stations.output", "Output today")}>
          {output.isPending ? (
            <SkeletonRows rows={4} />
          ) : output.isError ? (
            <ErrorState error={output.error} compact onRetry={() => void output.refetch()} />
          ) : output.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("stations.noOutput", "No units finished yet today.")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-1 text-left font-medium">{t("stations.staff", "Staff")}</th>
                  <th className="pb-1 text-left font-medium">{t("stations.station", "Station")}</th>
                  <th className="pb-1 text-right font-medium">{t("stations.units", "Units")}</th>
                  <th className="pb-1 text-right font-medium">
                    {t("stations.qcFails", "QC fails")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {output.data.items.map((r) => (
                  <tr key={`${r.userId}-${r.station}`} className="border-t border-border">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-muted-foreground">{t(`station.${r.station}`)}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.units}</td>
                    <td
                      className={cn(
                        "py-1.5 text-right tabular-nums",
                        r.qcFails > 0 && "text-danger",
                      )}
                    >
                      {r.qcFails}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </Page>
  );
}

/**
 * Station maintenance windows (B-35). Start/end is `production.maintenance` (office+); everyone
 * with `production.read` -- including a floor tablet -- sees which stations are closed, since a
 * closed station's scans return `mismatch: "station_maintenance"` for whoever hits it.
 */
function StationMaintenancePanel() {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const devices = useQuery(orpc.stations.list.queryOptions({ input: {} }));
  const open = useQuery(
    orpc.production.maintenance.list.queryOptions({ input: { open: true, limit: 200 } }),
  );
  const [starting, setStarting] = useState<StationDevice | null>(null);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.production.maintenance.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.stations.key() });
  };
  const end = useMutation(
    orpc.production.maintenance.end.mutationOptions({
      onSuccess: () => {
        toast.success(t("stations.maintenanceEnded", "Station reopened"));
        invalidate();
      },
    }),
  );
  const openByStation = new Map((open.data?.items ?? []).map((m) => [m.stationId, m]));
  return (
    <Section
      title={t("stations.maintenance", "Station maintenance")}
      description={t(
        "stations.maintenanceHint",
        "Close a station for cleaning or a repair; its scans block until it reopens.",
      )}
    >
      {devices.isPending ? (
        <SkeletonRows rows={2} />
      ) : devices.isError ? (
        <ErrorState error={devices.error} compact onRetry={() => void devices.refetch()} />
      ) : devices.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("stationsSettings.none", "No stations yet")}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {devices.data.items.map((s) => {
            const m = openByStation.get(s.id);
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                  m ? "border-warning bg-warning/10" : "border-border",
                )}
              >
                <span className="font-medium">{s.name}</span>
                {m ? (
                  <>
                    <Badge variant="warning">
                      <Wrench className="size-3" aria-hidden />
                      {t(`maintenanceReason.${m.reason}`, m.reason)}
                    </Badge>
                    {can("production.maintenance") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => end.mutate({ stationId: s.id, note: null })}
                        disabled={end.isPending}
                      >
                        {end.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        {t("stations.reopen", "Reopen")}
                      </Button>
                    )}
                  </>
                ) : (
                  can("production.maintenance") && (
                    <Button size="sm" variant="ghost" onClick={() => setStarting(s)}>
                      <PauseCircle />
                      {t("stations.close", "Close")}
                    </Button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
      {starting && (
        <StartMaintenanceDialog
          station={starting}
          onClose={() => setStarting(null)}
          onStarted={invalidate}
        />
      )}
    </Section>
  );
}

function StartMaintenanceDialog({
  station,
  onClose,
  onStarted,
}: {
  station: StationDevice;
  onClose: () => void;
  onStarted: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<(typeof MAINTENANCE_REASONS)[number]>("cleaning");
  const [note, setNote] = useState("");
  const start = useMutation(
    orpc.production.maintenance.start.mutationOptions({
      onSuccess: () => {
        toast.success(
          t("stations.maintenanceStarted", "{{name}} closed for maintenance", {
            name: station.name,
          }),
        );
        onStarted();
        onClose();
      },
    }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("stations.closeTitle", "Close {{name}}", { name: station.name })}
          </DialogTitle>
          <DialogDescription>
            {t(
              "stations.closeHint",
              "Scans at this station block with a clear message until it reopens.",
            )}
          </DialogDescription>
        </DialogHeader>
        <NativeSelect
          aria-label={t("stations.reason", "Reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
        >
          {MAINTENANCE_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`maintenanceReason.${r}`, r.replace(/_/g, " "))}
            </option>
          ))}
        </NativeSelect>
        <Textarea
          value={note}
          maxLength={500}
          rows={2}
          placeholder={t("stations.notePlaceholder", "Note (optional)")}
          aria-label={t("orders.note", "Note")}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() =>
              start.mutate({ stationId: station.id, reason, note: note.trim() || null })
            }
            disabled={start.isPending}
          >
            {start.isPending ? <Loader2 className="animate-spin" /> : <PauseCircle />}
            {t("stations.close", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

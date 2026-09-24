import { STATIONS, type Station } from "@invai/contracts";
import { Badge, Card, cn, EmptyState, RelativeTime, Skeleton } from "@invai/ui";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Radio, ScanLine, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { lastNDays } from "../../../lib/format";
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
  const today = lastNDays(1);
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
                            #{it.orderNo}
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
                  <span className="font-medium">{e.orderNo ? `#${e.orderNo}` : "—"}</span>
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

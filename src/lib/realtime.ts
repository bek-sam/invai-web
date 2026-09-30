import { REALTIME_SSE_PATH, type RealtimeEventName, RealtimeEvents } from "@invai/contracts";
import { toast } from "@invai/ui";
import { type QueryClient, type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { API_URL } from "./env";
import { orpc } from "./rpc";

export interface RealtimeMessage {
  name: string;
  payload: Record<string, unknown>;
  at: string;
  id: string | null;
}

type Listener = (m: RealtimeMessage) => void;
const listeners = new Set<Listener>();

/** Subscribe to raw realtime messages (job progress, scan feed). Returns an unsubscribe. */
export function onRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRealtimeListener(listener: Listener) {
  useEffect(() => onRealtime(listener), [listener]);
}

/** Which cached queries each event makes stale. */
export function keysForEvent(name: string): QueryKey[] {
  switch (name) {
    case "order.updated":
    case "order.imported":
    case "item.state_changed":
    case "item.flagged":
      return [
        orpc.orders.key(),
        orpc.orderItems.key(),
        orpc.today.key(),
        orpc.shipping.queue.key(),
      ];
    case "artwork.rendered":
      return [orpc.personalization.artwork.key(), orpc.orders.key(), orpc.orderItems.key()];
    case "sheet.status_changed":
      return [orpc.production.sheets.key(), orpc.today.key(), orpc.vendorPortal.key()];
    case "scan.result":
    case "queue.changed":
    case "bin.changed":
      return [orpc.production.queue.key(), orpc.today.key()];
    case "shipment.updated":
      return [orpc.shipping.key(), orpc.orders.key()];
    case "stock.low":
    case "stock.changed":
      return [orpc.inventory.key(), orpc.today.key()];
    case "job.progress":
      return [orpc.production.jobs.key()];
    case "import.completed":
      return [
        orpc.orders.key(),
        orpc.channels.key(),
        orpc.skuRules.unmapped.key(),
        orpc.today.key(),
      ];
    case "connection.health":
      return [orpc.channels.key()];
    case "listing_draft.updated":
      return [orpc.ai.listings.key()];
    case "alert.created":
      return [orpc.alerts.key(), orpc.today.key()];
    case "today.changed":
      return [orpc.today.key()];
    case "vendor.sheet_received":
      return [orpc.vendorPortal.key()];
    case "digest.ready":
      return [orpc.digest.key(), orpc.today.key()];
    case "station.maintenance_changed":
      return [orpc.production.maintenance.key(), orpc.stations.key(), orpc.production.queue.key()];
    default:
      return [];
  }
}

/** Accepts the contract envelope `{id, name, at, payload}` or a bare `{type, data}` body. */
export function parseMessage(
  eventName: string,
  raw: string,
  lastEventId: string | null,
): RealtimeMessage | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const name =
    typeof b.name === "string" ? b.name : typeof b.type === "string" ? b.type : eventName;
  const payloadRaw = b.payload ?? b.data ?? b;
  const payload =
    payloadRaw && typeof payloadRaw === "object" ? (payloadRaw as Record<string, unknown>) : {};
  const at = typeof b.at === "string" ? b.at : new Date().toISOString();
  const id = typeof b.id === "string" ? b.id : lastEventId;
  return { name, payload, at, id };
}

type Status = "connecting" | "open" | "closed";
let status: Status = "closed";
const statusListeners = new Set<() => void>();
function setStatus(s: Status) {
  status = s;
  for (const l of statusListeners) l();
}

export function useRealtimeStatus(): Status {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
  );
}

function connect(queryClient: QueryClient, notify: (m: RealtimeMessage) => void): () => void {
  const pending = new Map<string, QueryKey>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    flushTimer = null;
    for (const key of pending.values()) void queryClient.invalidateQueries({ queryKey: key });
    pending.clear();
  };

  const handle = (eventName: string) => (e: MessageEvent<string>) => {
    const msg = parseMessage(eventName, e.data, e.lastEventId || null);
    if (!msg) return;
    for (const key of keysForEvent(msg.name)) pending.set(JSON.stringify(key), key);
    if (!flushTimer) flushTimer = setTimeout(flush, 400);
    for (const l of listeners) l(msg);
    notify(msg);
  };

  setStatus("connecting");
  const es = new EventSource(`${API_URL}${REALTIME_SSE_PATH}`, { withCredentials: true });
  es.onopen = () => setStatus("open");
  es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "closed" : "connecting");
  es.onmessage = handle("message");
  const names = Object.keys(RealtimeEvents) as RealtimeEventName[];
  for (const name of names) es.addEventListener(name, handle(name) as EventListener);

  return () => {
    es.close();
    if (flushTimer) clearTimeout(flushTimer);
    setStatus("closed");
  };
}

/** One SSE connection for the signed-in app; invalidates queries by event name. */
export function useRealtime(enabled: boolean, orgId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || !orgId) return;
    return connect(queryClient, (m) => {
      if (
        m.name === "alert.created" &&
        m.payload.severity === "critical" &&
        typeof m.payload.title === "string"
      ) {
        toast.error(m.payload.title);
      }
      if (m.name === "vendor.sheet_received" && typeof m.payload.shopName === "string") {
        toast.info(`New sheet from ${m.payload.shopName}`);
      }
    });
  }, [enabled, orgId, queryClient]);
}

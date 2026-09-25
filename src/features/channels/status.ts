import type { ChannelConnection, ConnectionHealth, ImportReport } from "@invai/contracts";

/** Minutes without a sync before a connection counts as stale (the sync_broken alert's threshold). */
export const STALE_MINUTES = 30;

/** What Shopify's OAuth return (`/settings/channels?connected=…` or `?error=…`) means for the page. */
export type OAuthReturn =
  | { kind: "connected"; channel: string; connectionId: string | null }
  | { kind: "error"; reason: "expired" | "elsewhere" | "declined" | "generic"; detail: string };

export function readOAuthReturn(search: {
  connected?: string | undefined;
  connectionId?: string | undefined;
  error?: string | undefined;
}): OAuthReturn | null {
  if (search.error !== undefined) {
    const detail = search.error.slice(0, 300);
    const reason = /expired/i.test(detail)
      ? "expired"
      : /another InvAI account/i.test(detail)
        ? "elsewhere"
        : /access_denied|denied|cancel/i.test(detail)
          ? "declined"
          : "generic";
    return { kind: "error", reason, detail };
  }
  if (search.connected) {
    return {
      kind: "connected",
      channel: search.connected,
      connectionId: search.connectionId || null,
    };
  }
  return null;
}

/** One thing wrong with a connection, most important first. */
export type ConnectionIssue =
  | { kind: "pending" }
  | { kind: "token"; permanent: boolean; detail: string }
  | { kind: "webhooks"; detail: string }
  | { kind: "approval" }
  | { kind: "stale"; minutes: number }
  | { kind: "error"; detail: string };

/**
 * Turns a connection's health into plain issues. The API reports problems as text in
 * `lastError`, so token and webhook problems are recognized by the wording T-3-1 writes.
 */
export function connectionIssues(
  c: Pick<ChannelConnection, "status" | "mode">,
  health: ConnectionHealth,
): ConnectionIssue[] {
  const out: ConnectionIssue[] = [];
  if (c.status === "pending") out.push({ kind: "pending" });
  const err = health.lastError;
  if (err) {
    if (/Shopify (no longer accepts|access could not be renewed)/i.test(err)) {
      out.push({ kind: "token", permanent: /no longer accepts/i.test(err), detail: err });
    } else if (/^Webhook subscription failed/i.test(err)) {
      out.push({ kind: "webhooks", detail: err });
    } else if (/pending marketplace approval/i.test(err)) {
      if (!health.pendingApproval) out.push({ kind: "approval" });
    } else if (c.status !== "pending") {
      out.push({ kind: "error", detail: err });
    }
  }
  if (health.pendingApproval && c.mode === "api") out.push({ kind: "approval" });
  if (health.staleMinutes !== null && health.staleMinutes > STALE_MINUTES)
    out.push({ kind: "stale", minutes: health.staleMinutes });
  return out;
}

/** Reconnect restarts Shopify's approval screen; it's offered where that can help. */
export function canReconnect(c: Pick<ChannelConnection, "channel" | "status" | "mode">): boolean {
  return (
    c.channel === "shopify" && c.mode === "api" && (c.status === "pending" || c.status === "error")
  );
}

/** The shop domain to send back through Shopify's approval screen, when we know it. */
export function reconnectDomain(
  c: Pick<ChannelConnection, "externalShopId" | "name">,
): string | null {
  if (c.externalShopId) return c.externalShopId;
  const guess = `${c.name.trim().toLowerCase()}.myshopify.com`;
  return /^[a-z0-9-]+\.myshopify\.com$/.test(guess) ? guess : null;
}

/**
 * Stock push (T-3-3) is offered on API connections, and only runs while the store is connected
 * and its marketplace app is approved. CSV channels have no way to receive it.
 */
export function stockPush(
  c: Pick<ChannelConnection, "mode" | "status">,
  health: Pick<ConnectionHealth, "pendingApproval">,
): "hidden" | "active" | "paused" {
  if (c.mode !== "api" || c.status === "pending") return "hidden";
  return c.status === "connected" && !health.pendingApproval ? "active" : "paused";
}

export function importInProgress(r: Pick<ImportReport, "status">): boolean {
  return r.status === "queued" || r.status === "running";
}

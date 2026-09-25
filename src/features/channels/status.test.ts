import type { ConnectionHealth } from "@invai/contracts";
import { describe, expect, it } from "vitest";
import {
  canReconnect,
  connectionIssues,
  importInProgress,
  readOAuthReturn,
  reconnectDomain,
  stockPush,
} from "./status";

const healthy: ConnectionHealth = {
  ok: true,
  lastWebhookAt: null,
  lastPollAt: null,
  lastImportAt: null,
  ordersLast24h: 0,
  errorsLast24h: 0,
  lastError: null,
  pendingApproval: false,
  staleMinutes: 3,
};
const api = { status: "connected" as const, mode: "api" as const };

describe("readOAuthReturn", () => {
  it("reads a finished Shopify install", () => {
    expect(readOAuthReturn({ connected: "shopify", connectionId: "c1" })).toEqual({
      kind: "connected",
      channel: "shopify",
      connectionId: "c1",
    });
  });

  it("sorts the callback's errors into reasons, keeping the detail", () => {
    expect(
      readOAuthReturn({
        error: "This Shopify connection link has expired. Connect the store again.",
      }),
    ).toMatchObject({ kind: "error", reason: "expired" });
    expect(
      readOAuthReturn({ error: "This Shopify store is connected to another InvAI account" }),
    ).toMatchObject({ reason: "elsewhere" });
    expect(readOAuthReturn({ error: "OAuth HMAC mismatch" })).toEqual({
      kind: "error",
      reason: "generic",
      detail: "OAuth HMAC mismatch",
    });
    // An error wins over a stray `connected`.
    expect(readOAuthReturn({ connected: "shopify", error: "" })?.kind).toBe("error");
  });

  it("is null on a plain visit", () => {
    expect(readOAuthReturn({})).toBeNull();
  });
});

describe("connectionIssues", () => {
  it("has none for a healthy store", () => {
    expect(connectionIssues(api, healthy)).toEqual([]);
  });

  it("recognizes token and webhook problems", () => {
    expect(
      connectionIssues(api, {
        ...healthy,
        ok: false,
        lastError: "Shopify no longer accepts this connection's access. Reconnect the store.",
      }),
    ).toMatchObject([{ kind: "token", permanent: true }]);
    expect(
      connectionIssues(api, {
        ...healthy,
        ok: false,
        lastError: "Shopify access could not be renewed (timeout); retrying.",
      }),
    ).toMatchObject([{ kind: "token", permanent: false }]);
    expect(
      connectionIssues(api, {
        ...healthy,
        ok: false,
        lastError: "Webhook subscription failed: ORDERS_UPDATED (Access denied). Orders still…",
      }),
    ).toMatchObject([{ kind: "webhooks" }]);
  });

  it("reports a stale sync and pending approval once", () => {
    const issues = connectionIssues(
      { status: "error", mode: "api" },
      {
        ...healthy,
        ok: false,
        pendingApproval: true,
        staleMinutes: 45,
        lastError: "Etsy API access is pending marketplace approval; use CSV import",
      },
    );
    expect(issues).toEqual([{ kind: "approval" }, { kind: "stale", minutes: 45 }]);
  });

  it("says a pending install isn't finished instead of repeating its error", () => {
    expect(
      connectionIssues({ status: "pending", mode: "api" }, { ...healthy, lastError: "x" }),
    ).toEqual([{ kind: "pending" }]);
  });
});

describe("reconnect and stock push", () => {
  it("offers reconnect for pending or failed Shopify installs only", () => {
    expect(canReconnect({ channel: "shopify", mode: "api", status: "pending" })).toBe(true);
    expect(canReconnect({ channel: "shopify", mode: "api", status: "error" })).toBe(true);
    expect(canReconnect({ channel: "shopify", mode: "api", status: "connected" })).toBe(false);
    expect(canReconnect({ channel: "etsy", mode: "api", status: "error" })).toBe(false);
  });

  it("finds the shop domain", () => {
    expect(reconnectDomain({ externalShopId: "a.myshopify.com", name: "x" })).toBe(
      "a.myshopify.com",
    );
    expect(reconnectDomain({ externalShopId: null, name: "desert-bloom" })).toBe(
      "desert-bloom.myshopify.com",
    );
    expect(reconnectDomain({ externalShopId: null, name: "Desert Bloom Co" })).toBeNull();
  });

  it("shows the stock push only for API stores, active while connected and approved", () => {
    expect(stockPush({ mode: "csv", status: "csv_only" }, healthy)).toBe("hidden");
    expect(stockPush(api, healthy)).toBe("active");
    expect(stockPush(api, { pendingApproval: true })).toBe("paused");
    expect(stockPush({ mode: "api", status: "error" }, healthy)).toBe("paused");
    expect(stockPush({ mode: "api", status: "pending" }, healthy)).toBe("hidden");
  });

  it("knows which imports are still going", () => {
    expect(importInProgress({ status: "queued" })).toBe(true);
    expect(importInProgress({ status: "running" })).toBe(true);
    expect(importInProgress({ status: "completed" })).toBe(false);
  });
});

import type { Alert } from "@invai/contracts";
import type { TFunction } from "i18next";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { alertDateLabel, alertDetail } from "./index";

/** A minimal stand-in for i18next's `t`: interpolates `{{key}}` into the given fallback text. */
function fakeT(_key: string, fallback: unknown, opts?: Record<string, unknown>): string {
  const template = typeof fallback === "string" ? fallback : "";
  const values = typeof opts === "object" && opts ? opts : {};
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ""));
}
const t = fakeT as unknown as TFunction;

function alert(overrides: Partial<Alert>): Alert {
  return {
    id: "a1",
    kind: "order_at_risk",
    severity: "warning",
    title: "Order 1042 at risk",
    message: "Ships within 3h and has no label yet.",
    entity: { type: "order", id: "o1" },
    readAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("alertDateLabel", () => {
  // Etc/UTC has no DST, so the expected string is stable regardless of where tests run.
  it("formats in the shop's time zone and the active language", () => {
    expect(alertDateLabel("2026-10-02T17:00:00.000Z", "Etc/UTC", "en")).toBe("Oct 2, 5:00 PM");
    expect(alertDateLabel("2026-10-02T17:00:00.000Z", "Etc/UTC", "es")).toBe("2 oct, 5:00 p.m.");
  });

  it("falls back to the raw ISO string on an invalid time zone instead of throwing", () => {
    expect(alertDateLabel("2026-10-02T17:00:00.000Z", "Not/AZone", "en")).toBe(
      "2026-10-02T17:00:00.000Z",
    );
  });
});

describe("alertDetail", () => {
  it("builds the line from messageCode + params, with the order number and ship-by date", () => {
    const a = alert({
      messageCode: "order_at_risk",
      params: {
        orderNo: "1042",
        shipBy: "2026-10-02T17:00:00.000Z",
        timeZone: "Etc/UTC",
        hours: 3,
      },
    });
    const line = alertDetail(t, a, "en");
    expect(line).toContain("#1042");
    expect(line).toContain("3");
    expect(line).toContain("Oct 2, 5:00 PM");
  });

  it("builds the overdue line without an hours param", () => {
    const a = alert({
      kind: "order_overdue",
      messageCode: "order_overdue",
      params: { orderNo: "1042", shipBy: "2026-10-02T17:00:00.000Z", timeZone: "Etc/UTC" },
    });
    expect(alertDetail(t, a, "en")).toContain("#1042");
  });

  it("builds the stock_low line with blank name, available and reorder point", () => {
    const a = alert({
      kind: "stock_low",
      messageCode: "stock_low",
      params: { blankName: "Gildan 5000 Black M", available: 3, reorderPoint: 10, incoming: 0 },
    });
    const line = alertDetail(t, a, "en");
    expect(line).toContain("Gildan 5000 Black M");
    expect(line).toContain("3");
    expect(line).toContain("10");
  });

  it("falls back to title · message in English without a messageCode (old rows, worker/AI alerts)", () => {
    const a = alert({ messageCode: undefined, params: undefined });
    expect(alertDetail(t, a, "en")).toBe(
      "Order 1042 at risk · Ships within 3h and has no label yet.",
    );
  });

  it("falls back to the title only in Spanish without a messageCode", () => {
    const a = alert({ messageCode: undefined, params: undefined });
    expect(alertDetail(t, a, "es")).toBe("Order 1042 at risk");
  });

  it("falls back to the title-only behavior when params is missing (both-or-neither)", () => {
    // Defensive: the contract pairs messageCode+params, but a half-formed row must not crash.
    const a = { ...alert({}), messageCode: "order_at_risk" as const, params: undefined };
    expect(alertDetail(t, a, "en")).toBe(
      "Order 1042 at risk · Ships within 3h and has no label yet.",
    );
  });
});

/**
 * Real i18next pluralization for the two codes with an hours count (T-P4-3's lesson: a fake `t`
 * can't catch wrong number agreement), in both catalogs.
 */
describe("alerts.line pluralization (real i18next)", () => {
  async function makeI18n(lng: "en" | "es") {
    const instance = createInstance();
    await instance.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
    return instance;
  }

  it("uses the singular hour form for count 1", async () => {
    const i18nEn = await makeI18n("en");
    const i18nEs = await makeI18n("es");
    expect(i18nEn.t("alerts.line.order_at_risk", { count: 1, orderNo: "#1", date: "x" })).toContain(
      "1 hour",
    );
    expect(i18nEs.t("alerts.line.order_at_risk", { count: 1, orderNo: "#1", date: "x" })).toContain(
      "1 hora,",
    );
  });

  it("uses the plural hour form for 0 and more than 1", async () => {
    const i18nEn = await makeI18n("en");
    const i18nEs = await makeI18n("es");
    expect(
      i18nEn.t("alerts.line.sheet_stuck", { count: 0, sheetName: "S-1", status: "sent" }),
    ).toContain("0 hours");
    expect(
      i18nEn.t("alerts.line.sheet_stuck", { count: 5, sheetName: "S-1", status: "sent" }),
    ).toContain("5 hours");
    expect(
      i18nEs.t("alerts.line.sheet_stuck", { count: 5, sheetName: "S-1", status: "enviada" }),
    ).toContain("5 horas");
  });
});

import type { Alert } from "@invai/contracts";
import type { TFunction } from "i18next";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { alertDetail, dispatchRows, dispatchUnconfirmedCount } from "./index";
import { batchFailureMessage } from "./shipping";

async function makeT(lng: "en" | "es"): Promise<TFunction> {
  const i = createInstance();
  await i.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return i.t.bind(i) as unknown as TFunction;
}

function alert(code: NonNullable<Alert["messageCode"]>, shipBy = "2026-10-02T17:00:00.000Z") {
  return {
    id: "a1",
    kind: code === "dispatch_pickup_missed" ? "order_at_risk" : "order_overdue",
    severity: "critical",
    title: "x",
    message: "x",
    entity: { type: "order", id: "o1" },
    readAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    messageCode: code,
    params: { orderNo: "1042", shipBy, timeZone: "Etc/UTC", hours: 2, channel: "etsy" },
  } as Alert;
}

describe("dispatch alert lines", () => {
  it("pickup missed: en and es, no date, no tracking code", async () => {
    const a = alert("dispatch_pickup_missed");
    expect(alertDetail(await makeT("en"), a, "en")).toBe(
      "Order #1042 has a label but no carrier scan yet. Check that the carrier picked it up.",
    );
    expect(alertDetail(await makeT("es"), a, "es")).toBe(
      "El pedido #1042 tiene etiqueta pero el transportista aún no lo escaneó. Revisa que lo hayan recogido.",
    );
  });

  it("overdue: shows the ship-by like the order_overdue line", async () => {
    const a = alert("dispatch_overdue");
    expect(alertDetail(await makeT("en"), a, "en")).toBe(
      "Order #1042 was due Oct 2, 5:00 PM and still has no carrier scan.",
    );
    expect(alertDetail(await makeT("es"), a, "es")).toBe(
      "El pedido #1042 vencía el 2 oct, 5:00 p.m. y aún no tiene escaneo del transportista.",
    );
  });

  it("overdue unconfirmed: no doubled period after a Spanish p.m. date", async () => {
    const a = alert("dispatch_overdue_unconfirmed");
    expect(alertDetail(await makeT("en"), a, "en")).toBe(
      "Order #1042 was due Oct 2, 5:00 PM. Carrier updates are delayed, so we cannot confirm a scan. Check with the carrier.",
    );
    const es_ = alertDetail(await makeT("es"), a, "es");
    expect(es_).toBe(
      "El pedido #1042 vencía el 2 oct, 5:00 p.m. Las actualizaciones del transportista están retrasadas y no podemos confirmar el escaneo. Consulta con el transportista.",
    );
    expect(es_).not.toContain("..");
  });
});

describe("Today dispatch card rules", () => {
  it("one row per channel with the count, zero rows omitted", () => {
    expect(
      dispatchRows({
        dispatchAtRisk: [
          { channel: "etsy", count: 5 },
          { channel: "shopify", count: 3 },
          { channel: "tiktok", count: 0 },
        ],
      }),
    ).toEqual([
      { channel: "etsy", label: "Etsy", count: 5 },
      { channel: "shopify", label: "Shopify", count: 3 },
    ]);
  });

  it("is hidden (no rows) when the field is missing or empty: an older API keeps working", () => {
    expect(dispatchRows({})).toEqual([]);
    expect(dispatchRows({ dispatchAtRisk: [] })).toEqual([]);
    expect(dispatchRows(undefined)).toEqual([]);
  });

  it("unconfirmed count is 0 when missing or 0, the number otherwise", () => {
    expect(dispatchUnconfirmedCount(undefined)).toBe(0);
    expect(dispatchUnconfirmedCount({})).toBe(0);
    expect(dispatchUnconfirmedCount({ dispatchUnconfirmed: 0 })).toBe(0);
    expect(dispatchUnconfirmedCount({ dispatchUnconfirmed: 4 })).toBe(4);
  });

  it("copy: title, row and plural-safe unconfirmed line in en and es", async () => {
    const e = await makeT("en");
    const s = await makeT("es");
    expect(e("today.dispatch.title")).toBe("Past ship-by, no carrier scan");
    expect(s("today.dispatch.title")).toBe("Vencidas sin escaneo del transportista");
    expect(e("today.dispatch.row", { channel: "Etsy", count: 5 })).toBe("Etsy: 5");
    expect(e("today.dispatch.unconfirmed", { count: 1 })).toContain("for 1 label.");
    expect(e("today.dispatch.unconfirmed", { count: 3 })).toBe(
      "Carrier scan updates are delayed for 3 labels. Check with the carrier today.",
    );
    expect(s("today.dispatch.unconfirmed", { count: 3 })).toBe(
      "Las actualizaciones de escaneo están retrasadas para 3 etiquetas. Consulta hoy con el transportista.",
    );
    expect(s("today.dispatch.unconfirmed", { count: 1 })).toContain("para 1 etiqueta.");
  });
});

describe("label batch failure toast text", () => {
  it("maps a stored English sentence to Spanish", async () => {
    const s = await makeT("es");
    expect(batchFailureMessage({ error: "Every unit was cancelled" }, s)).toBe(
      "Se cancelaron todas las unidades",
    );
  });

  it("falls back to the job message, then to a translated default", async () => {
    const s = await makeT("es");
    const e = await makeT("en");
    expect(batchFailureMessage({ error: null, message: "Half done" }, s)).toBe("Half done");
    expect(batchFailureMessage({ error: null, message: null }, s)).toBe(
      "No se pudo comprar el lote de etiquetas. Vuelve a intentarlo en un minuto.",
    );
    expect(batchFailureMessage({}, e)).toBe("The label batch failed. Try again in a minute.");
  });
});

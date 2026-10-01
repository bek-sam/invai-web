import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { es } from "./es";

/**
 * T-P4-3 round 2: `designs.orders30` had only one form ("{{count}} orders · 30d"), so a design with
 * exactly one order in the last 30 days showed "1 orders" / "1 pedidos" (wrong number agreement,
 * loudest in Spanish). It now has `_one`/`_other` forms; this exercises the real i18next
 * pluralization (not a fake t()) against both catalogs. No design in the local seed currently has
 * ordersLast30d === 1 (checked live at 1440/390 es, all values are 8-28), so this is the only
 * evidence for the singular case.
 */
async function makeI18n(lng: "en" | "es") {
  const instance = createInstance();
  await instance.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return instance;
}

describe("designs.orders30 pluralization", () => {
  it("uses the singular form for exactly one order", async () => {
    const i18nEn = await makeI18n("en");
    const i18nEs = await makeI18n("es");
    expect(i18nEn.t("designs.orders30", { count: 1 })).toBe("1 order · 30d");
    expect(i18nEs.t("designs.orders30", { count: 1 })).toBe("1 pedido · 30 d");
  });

  it("uses the plural form for zero and for more than one order", async () => {
    const i18nEn = await makeI18n("en");
    const i18nEs = await makeI18n("es");
    expect(i18nEn.t("designs.orders30", { count: 0 })).toBe("0 orders · 30d");
    expect(i18nEn.t("designs.orders30", { count: 5 })).toBe("5 orders · 30d");
    expect(i18nEs.t("designs.orders30", { count: 0 })).toBe("0 pedidos · 30 d");
    expect(i18nEs.t("designs.orders30", { count: 5 })).toBe("5 pedidos · 30 d");
  });

  it("keeps a non-breaking space between the number and the unit in Spanish, so '30 d' never wraps", () => {
    expect(es.designs.orders30_other).toContain("30 d");
    expect(es.designs.orders30_other).not.toContain("30 d");
  });
});

import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { es } from "./es";

async function makeI18n(lng: "en" | "es") {
  const instance = createInstance();
  await instance.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return instance;
}

describe("qa.regions pluralization", () => {
  it("says '1 place' / '1 lugar' for one spot", async () => {
    expect((await makeI18n("en")).t("qa.regions", { count: 1 })).toBe("1 place");
    expect((await makeI18n("es")).t("qa.regions", { count: 1 })).toBe("1 lugar");
  });

  it("says 'places' / 'lugares' for three spots", async () => {
    expect((await makeI18n("en")).t("qa.regions", { count: 3 })).toBe("3 places");
    expect((await makeI18n("es")).t("qa.regions", { count: 3 })).toBe("3 lugares");
  });
});

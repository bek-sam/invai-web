import { PHOTO_CHECK_CODES, type PhotoCheckFailure, type PhotoImage } from "@invai/contracts";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { checkFailureMessage, imagePassesChecks } from "./labels";

async function makeT(lng: "en" | "es") {
  const instance = createInstance();
  await instance.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return instance.t.bind(instance);
}

const img = { checks: {}, channel: "etsy", preset: "etsy" } as unknown as PhotoImage;
const fail = (code: string, detail: string | null = null) =>
  ({ code, severity: "warn", detail }) as unknown as PhotoCheckFailure;

describe.each(["en", "es"] as const)("every PHOTO_CHECK_CODES entry has a message (%s)", (lng) => {
  it("is not the unknown-check fallback", async () => {
    const t = await makeT(lng);
    const fallback = checkFailureMessage(t as never, fail("not_a_real_code"), img);
    for (const code of PHOTO_CHECK_CODES) {
      const m = checkFailureMessage(t as never, fail(code), img);
      expect(m, code).not.toBe(fallback);
      expect(m, code).not.toMatch(/^photoCheck\./);
    }
  });
});

describe("blank_color_shift", () => {
  const COPY = {
    en: "This photo may show the shirt color a little off. Check it before you approve it.",
    es: "Es posible que el color de la camiseta se vea un poco distinto en esta foto. Revísala antes de aprobarla.",
  };
  it.each(["en", "es"] as const)("uses the approved copy and hides detail (%s)", async (lng) => {
    const m = checkFailureMessage(
      (await makeT(lng)) as never,
      fail("blank_color_shift", "delta_e 5.4"),
      img,
    );
    expect(m).toBe(COPY[lng]);
    expect(m).not.toMatch(/delta|5\.4|wrong|error|failed|incorrect|fall[óo]|error/i);
  });
  it("a warn-only image still passes, so it stays approvable", () => {
    const warnOnly = {
      checks: { passes: true, failures: [fail("blank_color_shift", "delta_e 5.4")] },
    } as unknown as PhotoImage;
    expect(imagePassesChecks(warnOnly)).toBe(true);
    expect(imagePassesChecks({ checks: null } as unknown as PhotoImage)).toBe(true);
    expect(
      imagePassesChecks({ checks: { passes: false, failures: [] } } as unknown as PhotoImage),
    ).toBe(false);
  });
});

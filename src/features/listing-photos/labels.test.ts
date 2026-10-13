import type { PhotoCheckFailure, PhotoImage } from "@invai/contracts";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { checkFailureMessage } from "./labels";

async function makeT(lng: "en" | "es") {
  const instance = createInstance();
  await instance.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return instance.t.bind(instance);
}

const img = { checks: {}, channel: "etsy", preset: "etsy" } as unknown as PhotoImage;
const fail = (code: string, detail: string | null) =>
  ({ code, detail }) as unknown as PhotoCheckFailure;

const PLACEMENT = {
  en: "The shirt moved in this photo, so the design may be out of place. Pick another scene or try again.",
  es: "La camiseta se movió en esta foto, así que el diseño puede estar fuera de lugar. Elige otra escena o inténtalo de nuevo.",
};
const GENERIC = {
  en: "The garment outline moved after this scene was generated.",
  es: "El contorno de la prenda cambió después de generar esta escena.",
};

describe.each(["en", "es"] as const)("checkFailureMessage region_changed (%s)", (lng) => {
  const msg = async (code: string, detail: string | null) =>
    checkFailureMessage((await makeT(lng)) as never, fail(code, detail), img);

  it("names placement off", async () => {
    expect(await msg("region_changed", "placement off")).toBe(PLACEMENT[lng]);
  });
  it("hides the numbers when placement off comes with them", async () => {
    const m = await msg("region_changed", "placement off, outline 0.83, at limit, foreign 0.012");
    expect(m).toBe(PLACEMENT[lng]);
    expect(m).not.toMatch(/outline|foreign|at limit|\d/);
  });
  it("keeps the generic message for numbers only", async () => {
    const m = await msg("region_changed", "outline 0.83, foreign 0.012");
    expect(m).toBe(GENERIC[lng]);
    expect(m).not.toMatch(/0\.83|foreign|at limit|\d/);
  });
  it("keeps the generic message for null detail", async () => {
    expect(await msg("region_changed", null)).toBe(GENERIC[lng]);
  });
  it("matches only the exact token", async () => {
    expect(await msg("region_changed", "Placement Off")).toBe(GENERIC[lng]);
    expect(await msg("region_changed", "placement  off")).toBe(GENERIC[lng]);
  });
  it("ignores detail for other codes", async () => {
    const m = await msg("wrong_aspect", "placement off");
    expect(m).not.toBe(PLACEMENT[lng]);
    expect(m).not.toMatch(/placement/);
  });
});

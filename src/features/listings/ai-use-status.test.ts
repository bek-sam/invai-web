import type { DesignAiUse, ListingDraftState } from "@invai/contracts";
import { createInstance } from "i18next";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { AiUseStatus } from "./ai-use-status";

const link = createElement("a", { href: "/catalog/designs/d1" }, "Say how it was made");

async function html(
  lng: "en" | "es",
  designAiUse: DesignAiUse | undefined,
  status: ListingDraftState = "needs_review",
  designLink: ReactNode | null = link,
) {
  const i18n = createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(AiUseStatus, { designAiUse, status, designLink }),
    ),
  );
}

describe("AiUseStatus", () => {
  it("ai: says the notice is included", async () => {
    expect(await html("en", "ai")).toContain(
      "Includes the AI notice: this design is marked made with AI.",
    );
    expect(await html("es", "ai")).toContain(
      "Incluye el aviso de IA: este diseño está marcado como hecho con IA.",
    );
  });

  it("none: says there is no notice", async () => {
    expect(await html("en", "none")).toContain(
      "No AI notice. You marked this design as made without AI.",
    );
    expect(await html("es", "none")).toContain(
      "Sin aviso de IA. Marcaste este diseño como hecho sin IA.",
    );
  });

  it("unknown: warning badge, reason and the link", async () => {
    const out = await html("en", "unknown");
    expect(out).toContain("Not set yet");
    expect(out).toContain("Includes the AI notice because nobody said how this design was made.");
    expect(out).toContain('href="/catalog/designs/d1"');
    expect(out).not.toContain("Ask the owner or designer.");
    expect(out).toMatch(/warning/);
    expect(await html("es", "unknown")).toContain("Incluye el aviso de IA porque nadie indicó");
  });

  it("unknown without catalog.manage: asks the owner instead of linking", async () => {
    const out = await html("en", "unknown", "needs_review", null);
    expect(out).toContain("Ask the owner or designer.");
    expect(out).not.toContain("<a ");
    expect(await html("es", "unknown", "needs_review", null)).toContain(
      "Pídelo al dueño o al diseñador.",
    );
  });

  it("absent designAiUse: no line at all, never 'off'", async () => {
    expect(await html("en", undefined)).toBe("");
    expect(await html("en", undefined, "published")).toBe("");
  });

  it.each(["publishing", "published"] as const)(
    "%s: only says whether the notice went out, never 'marked made with AI'",
    async (status) => {
      const withNotice = await html("en", "ai", status);
      expect(withNotice).toContain("This draft was published with the AI-use notice.");
      expect(withNotice).not.toContain("marked made with AI");
      const without = await html("en", "none", status);
      expect(without).toContain("This draft was published without the AI-use notice.");
      expect(await html("es", "ai", status)).toContain(
        "Este borrador se publicó con el aviso de uso de IA.",
      );
      expect(await html("es", "none", status)).toContain(
        "Este borrador se publicó sin el aviso de uso de IA.",
      );
    },
  );

  it("published unknown value is never shown as unknown/warning", async () => {
    const out = await html("en", "unknown", "published");
    expect(out).not.toContain("Not set yet");
  });

  it("has no raw keys", async () => {
    for (const v of ["ai", "none", "unknown"] as const)
      for (const l of ["en", "es"] as const)
        expect(await html(l, v)).not.toMatch(/listings\.aiUse/);
  });
});

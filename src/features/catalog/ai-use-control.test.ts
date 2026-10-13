import { DESIGN_AI_USES, type DesignAiUse } from "@invai/contracts";
import { createInstance } from "i18next";
import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { AiUseControl } from "./ai-use-control";

type Props = Parameters<typeof AiUseControl>[0];
const base: Props = {
  value: "unknown",
  canChange: true,
  saving: false,
  error: null,
  onSelect: () => {},
};

async function provider(lng: "en" | "es") {
  const i18n = createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return i18n;
}
const wrap = (i18n: Awaited<ReturnType<typeof provider>>, el: ReactElement) =>
  createElement(I18nextProvider, { i18n }, el);

async function html(lng: "en" | "es", props: Partial<Props>) {
  return renderToStaticMarkup(
    wrap(await provider(lng), createElement(AiUseControl, { ...base, ...props })),
  );
}

describe("AiUseControl markup", () => {
  it.each(DESIGN_AI_USES)("checks only the stored value %s", async (value) => {
    const out = await html("en", { value });
    const checked = [...out.matchAll(/<button[^>]*role="radio"[^>]*>/g)].filter((m) =>
      m[0].includes('aria-checked="true"'),
    );
    expect(checked).toHaveLength(1);
    expect(checked[0]?.[0]).toContain(`value="${value}"`);
    expect(out.match(/role="radio"/g)).toHaveLength(3);
  });

  it("shows the legend, the three labels and the help in English and Spanish, with no raw keys", async () => {
    const e = await html("en", {});
    for (const s of ["Made with AI?", "Not set yet", "No, made without AI", "Yes, made with AI"]) {
      expect(e).toContain(s);
    }
    expect(e).toContain("Until you choose No");
    const s = await html("es", {});
    for (const x of ["¿Hecho con IA?", "Sin definir", "No, hecho sin IA", "Sí, hecho con IA"]) {
      expect(s).toContain(x);
    }
    for (const out of [e, s]) expect(out).not.toMatch(/designs\.aiUse/);
  });

  it("shows the 'this is your statement' note only when No is selected", async () => {
    expect(await html("en", { value: "none" })).toContain("This is your statement");
    expect(await html("en", { value: "ai" })).not.toContain("This is your statement");
    expect(await html("es", { value: "none" })).toContain("Esta es tu declaración");
  });

  it("read-only: plain text of the stored value, the read-only line, no radios", async () => {
    const out = await html("en", { canChange: false, value: "ai" });
    expect(out).not.toContain('role="radio"');
    expect(out).toContain("Yes, made with AI");
    expect(out).toContain("Only people who manage the catalog can change this.");
    expect(await html("es", { canChange: false, value: "none" })).toContain(
      "Solo quienes administran el catálogo pueden cambiarlo.",
    );
  });

  it("save error: an alert with the text, radios still show the stored value", async () => {
    const out = await html("en", { value: "none", error: "Could not save. Try again." });
    expect(out).toMatch(/<p role="alert"[^>]*>Could not save\. Try again\.<\/p>/);
    expect(out).toMatch(
      /aria-checked="true"[^>]*value="none"|value="none"[^>]*aria-checked="true"/,
    );
  });

  it("no alert when there is no error; group disabled while saving", async () => {
    expect(await html("en", {})).not.toContain('role="alert"');
    const out = await html("en", { saving: true });
    expect([...out.matchAll(/role="radio"[^>]*>/g)].every((m) => m[0].includes("disabled"))).toBe(
      true,
    );
  });
});

describe("AiUseControl interaction (jsdom from the linked invai-ui)", () => {
  let root: { render(el: ReactElement): void; unmount(): void } | null = null;
  let host: HTMLElement | null = null;
  const globals = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLFormElement",
    "HTMLInputElement",
    "HTMLButtonElement",
    "Element",
    "Node",
    "MutationObserver",
    "ResizeObserver",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "getComputedStyle",
  ];

  beforeAll(async () => {
    // jsdom is not an app dependency; take it from the linked kit, which always sits beside this repo.
    const nodeModule = (
      globalThis as unknown as {
        process: {
          getBuiltinModule(id: "node:module"): {
            createRequire(url: string): (id: string) => unknown;
          };
        };
      }
    ).process.getBuiltinModule("node:module");
    const { JSDOM } = nodeModule.createRequire(import.meta.url)(
      "../../../../invai-ui/node_modules/jsdom",
    ) as { JSDOM: new (html: string, o: object) => { window: object } };
    const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
    const w = dom.window as unknown as Record<string, unknown>;
    for (const k of globals) {
      if (w[k] === undefined) continue;
      Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
    }
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  async function mount(props: Partial<Props>) {
    const { createRoot } = await import("react-dom/client");
    host = document.createElement("div");
    document.body.append(host);
    const r = createRoot(host);
    root = r;
    const i18n = await provider("en");
    act(() => r.render(wrap(i18n, createElement(AiUseControl, { ...base, ...props }))));
    return host;
  }
  const radio = (h: HTMLElement, v: DesignAiUse) =>
    h.querySelector(`button[role="radio"][value="${v}"]`) as HTMLButtonElement;

  it("picking another value calls onSelect with it; the stored one stays selected", async () => {
    const onSelect = vi.fn();
    const h = await mount({ value: "unknown", onSelect });
    act(() => radio(h, "none").click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("none");
    expect(radio(h, "unknown").getAttribute("aria-checked")).toBe("true");
    expect(radio(h, "none").getAttribute("aria-checked")).toBe("false");
  });

  it("clicking the value already stored does not save", async () => {
    const onSelect = vi.fn();
    const h = await mount({ value: "ai", onSelect });
    act(() => radio(h, "ai").click());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("arrow keys move the selection (kit defaults)", async () => {
    const onSelect = vi.fn();
    const h = await mount({ value: "unknown", onSelect });
    const first = radio(h, "unknown");
    act(() => first.focus());
    await act(async () => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
      // Radix moves focus on a timer; the focus then selects the radio.
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("none");
  });
});

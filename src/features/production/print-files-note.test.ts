import { createInstance } from "i18next";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { cancelledWithoutFiles, PrintFilesNote, printFilesRemoved } from "./print-files-note";

const STATUSES = [
  "building",
  "ready",
  "printing",
  "sent",
  "acknowledged",
  "printed",
  "shipped",
  "received",
  "failed",
  "cancelled",
];
const none = { pngKey: null, pdfKey: null };

async function html(
  lng: "en" | "es",
  sheet: Parameters<typeof PrintFilesNote>[0]["sheet"],
  audience: "shop" | "vendor",
) {
  const i18n = createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(PrintFilesNote, { sheet, audience })),
  );
}

describe("printFilesRemoved / cancelledWithoutFiles", () => {
  it("covers every status, with and without keys", () => {
    for (const status of STATUSES) {
      const purged = ["printed", "shipped", "received"].includes(status);
      expect(printFilesRemoved({ status, files: none })).toBe(purged);
      expect(cancelledWithoutFiles({ status, files: none })).toBe(status === "cancelled");
      expect(printFilesRemoved({ status, files: { pngKey: "a", pdfKey: "b" } })).toBe(false);
      expect(cancelledWithoutFiles({ status, files: { pngKey: "a", pdfKey: "b" } })).toBe(false);
    }
  });
  it("needs both keys null", () => {
    expect(printFilesRemoved({ status: "printed", files: { pngKey: "a", pdfKey: null } })).toBe(
      false,
    );
    expect(printFilesRemoved({ status: "printed", files: { pngKey: null, pdfKey: "b" } })).toBe(
      false,
    );
  });
});

describe("PrintFilesNote", () => {
  const printed = { status: "printed", files: none };
  it("shop line, EN and ES", async () => {
    expect(await html("en", printed, "shop")).toContain(
      "Print files were removed to protect buyer data. To print these designs again, build a new sheet.",
    );
    expect(await html("es", printed, "shop")).toContain(
      "Los archivos de impresión se quitaron para proteger los datos del comprador. Para imprimir estos diseños otra vez, arma una hoja nueva.",
    );
  });
  it("vendor line drops the build sentence", async () => {
    const e = await html("en", printed, "vendor");
    expect(e).toContain("Print files were removed to protect buyer data.");
    expect(e).not.toContain("build a new sheet");
    const s = await html("es", printed, "vendor");
    expect(s).toContain(
      "Los archivos de impresión se quitaron para proteger los datos del comprador.",
    );
    expect(s).not.toContain("arma una hoja");
  });
  it("shows nothing for a ready sheet with null keys, or failed", async () => {
    expect(await html("en", { status: "ready", files: none }, "shop")).toBe("");
    expect(await html("es", { status: "failed", files: none }, "vendor")).toBe("");
  });
  it("cancelled sheet (no dates needed), shop and vendor, EN and ES", async () => {
    const c = { status: "cancelled", files: none };
    expect(await html("en", c, "shop")).toContain(
      "This sheet was cancelled, so it has no print files. To print these designs, build a new sheet.",
    );
    expect(await html("es", c, "shop")).toContain(
      "Esta hoja se canceló, así que no tiene archivos de impresión. Para imprimir estos diseños, arma una hoja nueva.",
    );
    expect(await html("en", c, "vendor")).toContain(
      "This sheet was cancelled, so it has no print files.",
    );
    expect(await html("en", c, "vendor")).not.toContain("build");
    expect(await html("es", c, "vendor")).toContain(
      "Esta hoja se canceló, así que no tiene archivos de impresión.",
    );
  });
});

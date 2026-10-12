import i18n from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { es } from "../i18n/es";
import { storedErrorMessage } from "./stored-error";

const SENTENCES = [
  "The AI service could not finish this request. Try again in a minute. (INTERNAL)",
  "OpenAI could not finish this request. Try again in a minute. (UPSTREAM_FAILED)",
  "The AI service could not finish this request. Try again in a minute. (UPSTREAM_FAILED)",
  "The carrier could not deliver to this address (address_invalid)",
  "The carrier rate expired (rate_expired)",
  "The carrier did not answer (upstream)",
  "An outside service could not complete the request (UPSTREAM_FAILED)",
  "The channel did not accept the tracking upload (push_failed)",
  "Cancelled: the label is being voided",
  "On hold: tracking is sent when the hold is released",
  "Every unit was cancelled",
  "Upload tracking on the channel by hand",
];

let tEn: typeof i18n.t;
let tEs: typeof i18n.t;

beforeAll(async () => {
  const inst = i18n.createInstance();
  await inst.init({
    lng: "en",
    resources: { en: { translation: en }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
  tEn = inst.getFixedT("en");
  tEs = inst.getFixedT("es");
});

describe("storedErrorMessage", () => {
  it("translates the AI sentences and keeps the service name", () => {
    expect(storedErrorMessage(SENTENCES[0], tEs)).toBe(
      "El servicio de IA no pudo terminar esta solicitud. Vuelve a intentarlo en un minuto.",
    );
    expect(storedErrorMessage(SENTENCES[1], tEs)).toBe(
      "OpenAI no pudo terminar esta solicitud. Vuelve a intentarlo en un minuto.",
    );
    expect(storedErrorMessage(SENTENCES[1], tEn)).toBe(
      "OpenAI could not finish this request. Try again in a minute.",
    );
    expect(storedErrorMessage(SENTENCES[2], tEs)).toContain("El servicio de IA no pudo");
  });

  it("keeps a service name with accents or an ampersand as written", () => {
    const text =
      "Étsy & Co could not finish this request. Try again in a minute. (UPSTREAM_FAILED)";
    expect(storedErrorMessage(text, tEs)).toBe(
      "Étsy & Co no pudo terminar esta solicitud. Vuelve a intentarlo en un minuto.",
    );
  });

  it("translates the shipping sentences in Spanish and English", () => {
    expect(storedErrorMessage(SENTENCES[3], tEs)).toContain("La paquetería no pudo entregar");
    expect(storedErrorMessage(SENTENCES[3], tEn)).toBe(
      "The carrier could not deliver to this address. Check the address and try again.",
    );
    expect(storedErrorMessage(SENTENCES[4], tEs)).toBe(
      "La tarifa de la paquetería venció. Pide una tarifa nueva.",
    );
    expect(storedErrorMessage(SENTENCES[5], tEs)).toContain("La paquetería no respondió");
    expect(storedErrorMessage(SENTENCES[6], tEs)).toContain("Un servicio externo");
    expect(storedErrorMessage(SENTENCES[7], tEs)).toContain("El canal no aceptó el rastreo");
  });

  it("translates the code-less tracking-push sentences", () => {
    expect(storedErrorMessage(SENTENCES[8], tEs)).toBe("Cancelado: la etiqueta se está anulando");
    expect(storedErrorMessage(SENTENCES[9], tEs)).toContain("En espera");
    expect(storedErrorMessage(SENTENCES[10], tEs)).toBe("Se cancelaron todas las unidades");
    expect(storedErrorMessage(SENTENCES[11], tEs)).toBe("Sube el rastreo en el canal a mano");
    expect(storedErrorMessage(SENTENCES[8], tEn)).toBe(SENTENCES[8]);
  });

  it("never leaves an English sentence or a raw code in Spanish", () => {
    for (const s of SENTENCES) {
      const out = storedErrorMessage(s, tEs) ?? "";
      expect(out, s).not.toBe(s);
      expect(out, s).not.toMatch(/\([A-Za-z_]+\)/);
    }
  });

  it("returns unknown text unchanged, including a code in the middle or a different case", () => {
    const easypost =
      "EasyPost is limiting requests right now (RATE_LIMITED). Try again in a minute.";
    expect(storedErrorMessage(easypost, tEs)).toBe(easypost);
    expect(storedErrorMessage("Something odd (INTERNAL)", tEs)).toBe("Something odd (INTERNAL)");
    const lower = "the carrier rate expired (rate_expired)";
    expect(storedErrorMessage(lower, tEs)).toBe(lower);
    const prefixed = "Note: The carrier rate expired (rate_expired)";
    expect(storedErrorMessage(prefixed, tEs)).toBe(prefixed);
    expect(storedErrorMessage("failed", tEs)).toBe("failed");
  });

  it("shows nothing for empty or null", () => {
    expect(storedErrorMessage(null, tEs)).toBeNull();
    expect(storedErrorMessage(undefined, tEs)).toBeNull();
    expect(storedErrorMessage("", tEs)).toBeNull();
  });
});

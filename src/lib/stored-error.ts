import type { TFunction } from "i18next";

/**
 * The backend stores a few fixed English sentences when an AI call, a carrier call or a tracking
 * upload fails (`invai-backend/src/ai/stored-error.ts`, `src/modules/shipping/stored-error.ts`,
 * `shipping/service.ts`). This shows them in the active language.
 *
 * Each producer's whole sentence is matched, case-sensitive, never the code alone, so a provider
 * text that happens to contain a code is not rewritten. Anything else comes back unchanged: no
 * information is lost. The trailing code (an internal word) is dropped from the translated line.
 */

const AI_FAILED =
  /^(.{1,40}) could not finish this request\. Try again in a minute\. \(UPSTREAM_FAILED\)$/;
const AI_DEFAULT_NAME = "The AI service";

function aiFailed(name: string, t: TFunction): string {
  const shown = name === AI_DEFAULT_NAME ? t("storedError.aiServiceName", "The AI service") : name;
  return t(
    "storedError.aiUpstream",
    "{{name}} could not finish this request. Try again in a minute.",
    { name: shown, interpolation: { escapeValue: false } },
  );
}

/** Fixed sentences, exactly as the backend writes them (code in parentheses included). */
function fixed(text: string, t: TFunction): string | null {
  switch (text) {
    case "The AI service could not finish this request. Try again in a minute. (INTERNAL)":
      return t(
        "storedError.aiInternal",
        "The AI service could not finish this request. Try again in a minute.",
      );
    case "The carrier could not deliver to this address (address_invalid)":
      return t(
        "storedError.addressInvalid",
        "The carrier could not deliver to this address. Check the address and try again.",
      );
    case "The carrier rate expired (rate_expired)":
      return t("storedError.rateExpired", "The carrier rate expired. Get a new rate.");
    case "The carrier did not answer (upstream)":
      return t("storedError.carrierSilent", "The carrier did not answer. Try again in a minute.");
    case "An outside service could not complete the request (UPSTREAM_FAILED)":
      return t(
        "storedError.outsideService",
        "An outside service could not complete the request. Try again in a minute.",
      );
    case "The channel did not accept the tracking upload (push_failed)":
      return t(
        "storedError.pushRejected",
        "The channel did not accept the tracking upload. Try again, or add it on the channel by hand.",
      );
    case "Cancelled: the label is being voided":
      return t("storedError.cancelledVoiding", "Cancelled: the label is being voided");
    case "On hold: tracking is sent when the hold is released":
      return t("storedError.onHold", "On hold: tracking is sent when the hold is released");
    case "Every unit was cancelled":
      return t("storedError.allCancelled", "Every unit was cancelled");
    case "Set a ship-from address in shipping settings first":
      return t("storedError.shipFromMissing", "Set a ship-from address in shipping settings first");
    case "Upload tracking on the channel by hand":
      return t("storedError.manualUpload", "Upload tracking on the channel by hand");
    default:
      return null;
  }
}

/** The stored error text in the active language, or null when there is nothing to show. */
export function storedErrorMessage(text: string | null | undefined, t: TFunction): string | null {
  if (!text) return null;
  const ai = AI_FAILED.exec(text);
  if (ai?.[1]) return aiFailed(ai[1], t);
  return fixed(text, t) ?? text;
}

import type { TimelineReasonCode, TimelineReasonParams } from "@invai/contracts";
import type { TFunction } from "i18next";

// Pulls the transition reason out of a timeline entry's free-text `message`, without
// translating it. This is the fallback for an entry with no `reasonCode` (old rows, or a reason
// string the backend doesn't map to a code yet; ruling R1, waves/P5/reviews/plan-architect.md).
// The backend builds `message` as
// `${from ?? "new"} → ${to}${reason ? ` (${reason})` : ""}` (invai-backend/src/modules/orders/service.ts).
// We strip that exact prefix and its ` (`…`)` wrapper to recover the raw reason, per the
// tech lead's round 2 ruling on T-P2-4.
export type TimelineReason =
  | { type: "reason"; text: string }
  | { type: "none" }
  // The message didn't start with the expected prefix (unexpected/old format): show it as-is.
  | { type: "raw"; text: string };

export function extractTimelineReason(
  message: string,
  from: string | null,
  to: string,
): TimelineReason {
  const prefix = `${from ?? "new"} → ${to}`;
  if (!message.startsWith(prefix)) {
    return { type: "raw", text: message };
  }
  const rest = message.slice(prefix.length);
  if (rest.startsWith(" (") && rest.endsWith(")")) {
    return { type: "reason", text: rest.slice(2, -1) };
  }
  return { type: "none" };
}

/** A translated word's first letter lowercased, for mid-sentence use. */
function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * 0.11.0 (ruling R1, waves/P5/reviews/plan-architect.md): the translated short label per
 * `reasonCode`, keyed by a Record (never an exhaustive switch) so a code this build doesn't know
 * yet falls through to `null`, and the caller keeps today's `extractTimelineReason` fallback.
 * Hold/cancel reasons reuse the existing `holdReason.*`/`cancelReason.*` labels (the dialogs use
 * them); reprint reuses `reprintReason.*` (the floor QC/reprint dialogs use it).
 */
const TIMELINE_REASON_LABELS: Partial<
  Record<TimelineReasonCode, (t: TFunction, p: TimelineReasonParams) => string>
> = {
  unknown_sku: (t) => t("orders.timelineReason.unknown_sku", "No SKU match"),
  mapped: (t) => t("orders.timelineReason.mapped", "Mapped to a product"),
  not_personalized: (t) => t("orders.timelineReason.not_personalized", "Not personalized"),
  artwork_uploaded: (t) => t("orders.timelineReason.artwork_uploaded", "Artwork uploaded"),
  artwork_approved: (t) => t("orders.timelineReason.artwork_approved", "Artwork approved"),
  artwork_edited: (t) => t("orders.timelineReason.artwork_edited", "Artwork edited"),
  artwork_rerendered: (t) => t("orders.timelineReason.artwork_rerendered", "Artwork re-rendered"),
  artwork_rendered: (t) => t("orders.timelineReason.artwork_rendered", "Artwork rendered"),
  artwork_failed: (t) => t("orders.timelineReason.artwork_failed", "Artwork render failed"),
  artwork_flagged: (t) => t("orders.timelineReason.artwork_flagged", "Artwork flagged"),
  on_sheet: (t, p) =>
    t("orders.timelineReason.on_sheet", "On sheet {{sheetName}}", { sheetName: p.sheetName ?? "" }),
  sheet_received: (t, p) =>
    t("orders.timelineReason.sheet_received", "Sheet {{sheetName}} received", {
      sheetName: p.sheetName ?? "",
    }),
  scan_match: (t) => t("orders.timelineReason.scan_match", "Scan match"),
  reprint: (t, p) =>
    p.reprintReason
      ? t("orders.timelineReason.reprint", "Reprint: {{reason}}", {
          reason: lowerFirst(t(`reprintReason.${p.reprintReason}`, p.reprintReason)),
        })
      : t("orders.timelineReason.reprintNoReason", "Reprint"),
  qc_fail: (t) => t("orders.timelineReason.qc_fail", "QC fail"),
  qc_pass: (t) => t("orders.timelineReason.qc_pass", "QC pass"),
  held: (t, p) =>
    t("orders.timelineReason.held", "On hold: {{reason}}", {
      reason: lowerFirst(
        p.holdReason
          ? t(`holdReason.${p.holdReason}`, p.holdReason)
          : t("holdReason.other", "Other"),
      ),
    }),
  released: (t) => t("orders.timelineReason.released", "Released"),
  cancelled: (t, p) =>
    t("orders.timelineReason.cancelled", "Cancelled: {{reason}}", {
      reason: lowerFirst(
        p.cancelReason
          ? t(`cancelReason.${p.cancelReason}`, p.cancelReason)
          : t("cancelReason.other", "Other"),
      ),
    }),
  tracking_pushed: (t) => t("orders.timelineReason.tracking_pushed", "Tracking sent"),
  carrier_accepted: (t) =>
    t("orders.timelineReason.carrier_accepted", "Carrier accepted the package"),
  carrier_delivered: (t) => t("orders.timelineReason.carrier_delivered", "Carrier delivered"),
};

/** The translated reason label for a timeline entry's `reasonCode`, or `null` when unknown. */
export function timelineReasonLabel(
  t: TFunction,
  code: TimelineReasonCode,
  params: TimelineReasonParams | undefined,
): string | null {
  return TIMELINE_REASON_LABELS[code]?.(t, params ?? {}) ?? null;
}

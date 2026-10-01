import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { extractTimelineReason, timelineReasonLabel } from "./timeline-reason";

/** A minimal stand-in for i18next's `t`: interpolates `{{key}}` into the given fallback text. */
function fakeT(key: string, fallback: unknown, opts?: Record<string, unknown>): string {
  // The reprint/hold/cancel label lookups (`reprintReason.${x}` etc) pass the raw value as their
  // own fallback and no params; echo it back like the real catalogs do for a known reason.
  if (typeof fallback === "string" && !opts && !fallback.includes("{{")) return fallback;
  const template = typeof fallback === "string" ? fallback : key;
  const values = typeof opts === "object" && opts ? opts : {};
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ""));
}
const t = fakeT as unknown as TFunction;

describe("extractTimelineReason", () => {
  it("extracts the reason when the message matches the backend's prefix", () => {
    expect(extractTimelineReason("pressed → packed (qc_fail)", "pressed", "packed")).toEqual({
      type: "reason",
      text: "qc_fail",
    });
    // "new" is literal text in the message when `from` is null.
    expect(extractTimelineReason("new → imported (buyer_request)", null, "imported")).toEqual({
      type: "reason",
      text: "buyer_request",
    });
    // Reasons can contain their own parentheses and punctuation; the match is greedy to the end.
    expect(
      extractTimelineReason("pressed → packed (reprint: bad art (v2))", "pressed", "packed"),
    ).toEqual({ type: "reason", text: "reprint: bad art (v2)" });
  });

  it("returns none when the prefix matches but there is no reason", () => {
    expect(extractTimelineReason("pressed → packed", "pressed", "packed")).toEqual({
      type: "none",
    });
    expect(extractTimelineReason("new → imported", null, "imported")).toEqual({ type: "none" });
  });

  it("falls back to the raw message on an unexpected format", () => {
    expect(extractTimelineReason("something else entirely", "pressed", "packed")).toEqual({
      type: "raw",
      text: "something else entirely",
    });
    // from/to don't match this message's actual states.
    expect(extractTimelineReason("packed → shipped (ok)", "pressed", "packed")).toEqual({
      type: "raw",
      text: "packed → shipped (ok)",
    });
  });
});

describe("timelineReasonLabel", () => {
  it("labels a code with no params", () => {
    expect(timelineReasonLabel(t, "scan_match", undefined)).toBe("Scan match");
    expect(timelineReasonLabel(t, "qc_fail", {})).toBe("QC fail");
  });

  it("fills a sheetName param (on_sheet, sheet_received)", () => {
    expect(timelineReasonLabel(t, "on_sheet", { sheetName: "S-12" })).toBe("On sheet S-12");
    expect(timelineReasonLabel(t, "sheet_received", { sheetName: "S-12" })).toBe(
      "Sheet S-12 received",
    );
  });

  it("reuses the existing reprintReason label when the reprint reason is known", () => {
    expect(timelineReasonLabel(t, "reprint", { reprintReason: "misprint" })).toBe(
      "Reprint: misprint",
    );
  });

  it("falls back to a bare label when the reprint has no (or an unmapped) reason", () => {
    expect(timelineReasonLabel(t, "reprint", {})).toBe("Reprint");
    expect(timelineReasonLabel(t, "reprint", undefined)).toBe("Reprint");
  });

  it("reuses the existing holdReason/cancelReason labels", () => {
    expect(timelineReasonLabel(t, "held", { holdReason: "buyer_request" })).toBe(
      "On hold: buyer_request",
    );
    expect(timelineReasonLabel(t, "cancelled", { cancelReason: "out_of_stock" })).toBe(
      "Cancelled: out_of_stock",
    );
  });

  it("falls back to 'other' when held/cancelled carries no reason", () => {
    expect(timelineReasonLabel(t, "held", {})).toBe("On hold: other");
    expect(timelineReasonLabel(t, "cancelled", {})).toBe("Cancelled: other");
  });

  it("returns null for a code this build doesn't know (treated like no code, never a thrown switch)", () => {
    // Cast past the enum: proves the Record lookup degrades gracefully instead of throwing.
    expect(timelineReasonLabel(t, "a_future_code" as never, undefined)).toBeNull();
  });
});

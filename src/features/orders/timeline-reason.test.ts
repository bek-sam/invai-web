import { describe, expect, it } from "vitest";
import { extractTimelineReason } from "./timeline-reason";

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

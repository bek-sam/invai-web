import { describe, expect, it } from "vitest";
import {
  CHECKLIST_STEPS,
  type Checklist,
  checklistProgress,
  isEmptyWorkspace,
  showChecklist,
} from "./steps";

const none: Checklist = {
  channelConnected: false,
  blanksImported: false,
  skusMapped: false,
  vendorAdded: false,
  staffInvited: false,
  shipFromAddress: false,
  carrier: false,
  tabletPaired: false,
  designsUploaded: false,
  costsSet: false,
  planChosen: false,
  dismissed: false,
  dismissedAt: null,
};
const all: Checklist = Object.fromEntries(
  Object.entries(none).map(([k, v]) => [k, typeof v === "boolean" ? k !== "dismissed" : v]),
) as Checklist;

describe("setup checklist", () => {
  it("has the 11 steps, each linking to where it's done", () => {
    expect(CHECKLIST_STEPS).toHaveLength(11);
    expect(new Set(CHECKLIST_STEPS.map((s) => s.key)).size).toBe(11);
    for (const s of CHECKLIST_STEPS) expect(s.to).toMatch(/^\/(settings|catalog)\//);
  });

  it("counts progress and hides when complete or dismissed", () => {
    expect(checklistProgress(none)).toEqual({ done: 0, total: 11, complete: false });
    expect(checklistProgress({ ...none, carrier: true, costsSet: true }).done).toBe(2);
    expect(showChecklist(none)).toBe(true);
    expect(showChecklist(all)).toBe(false);
    expect(showChecklist({ ...none, dismissed: true, dismissedAt: "2026-09-25T00:00:00Z" })).toBe(
      false,
    );
    expect(showChecklist(null)).toBe(false);
  });

  it("offers the sample shop only while nothing is set up", () => {
    expect(isEmptyWorkspace(none)).toBe(true);
    expect(isEmptyWorkspace({ ...none, blanksImported: true })).toBe(false);
  });
});

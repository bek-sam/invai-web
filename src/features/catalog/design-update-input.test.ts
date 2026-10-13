import { DESIGN_AI_USES } from "@invai/contracts";
import { describe, expect, it, vi } from "vitest";
import { chooseAiUse, saveDesignForm } from "./design-update-input";

// `update` stands in for the oRPC client's designs.update.
const form = {
  code: "AIU-1",
  name: "Cactus",
  tags: ["a"],
  personalizationTemplateId: null,
  placements: [{ placement: "front" as const, fileKey: "k", widthIn: 1, heightIn: 1 }],
};

describe("designs.update input", () => {
  it.each(DESIGN_AI_USES)("choosing %s sends exactly { id, aiUse }", (aiUse) => {
    const update = vi.fn();
    chooseAiUse(update, "d1", aiUse);
    expect(update).toHaveBeenCalledExactlyOnceWith({ id: "d1", aiUse });
    expect(Object.keys(update.mock.calls[0]?.[0]).sort()).toEqual(["aiUse", "id"]);
  });

  it("the page Save sends the form fields and no aiUse key", () => {
    const update = vi.fn();
    saveDesignForm(update, "d1", form);
    const input = update.mock.calls[0]?.[0];
    expect(input).toEqual({ id: "d1", ...form });
    expect(Object.hasOwn(input, "aiUse")).toBe(false);
  });

  it("the page Save drops an aiUse that rides along in the form", () => {
    const update = vi.fn();
    saveDesignForm(update, "d1", { ...form, aiUse: "ai" });
    expect(Object.hasOwn(update.mock.calls[0]?.[0], "aiUse")).toBe(false);
  });
});

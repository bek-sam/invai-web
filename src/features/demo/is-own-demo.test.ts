import { describe, expect, it } from "vitest";
import { hasOtherCompany, isOwnDemo } from "./is-own-demo";

const org = (over: Partial<{ id: string; slug: string; demo: boolean }>) => ({
  id: "c1",
  type: "shop" as const,
  name: "Shop",
  slug: "shop",
  timezone: "America/Phoenix",
  plan: "trial" as const,
  demo: false,
  printsInHouse: false,
  productionPartner: null,
  createdAt: "2026-09-25T00:00:00Z",
  ...over,
});

describe("sample shop", () => {
  it("is only the person's own demo, not any shop flagged demo", () => {
    expect(isOwnDemo({ org: org({ demo: true, slug: "demo-c1" }) })).toBe(true);
    expect(isOwnDemo({ org: org({ demo: true, slug: "desert-bloom-tees" }) })).toBe(false);
    expect(isOwnDemo({ org: org({ demo: false, slug: "demo-c1" }) })).toBe(false);
  });

  it("offers leaving only when there is another company", () => {
    const me = { org: org({ demo: true, slug: "demo-c1" }), orgs: [] };
    expect(
      hasOtherCompany({ ...me, orgs: [{ id: "c1", name: "x", type: "shop", role: "owner" }] }),
    ).toBe(false);
    expect(
      hasOtherCompany({
        ...me,
        orgs: [
          { id: "c1", name: "x", type: "shop", role: "owner" },
          { id: "c2", name: "y", type: "shop", role: "owner" },
        ],
      }),
    ).toBe(true);
  });
});

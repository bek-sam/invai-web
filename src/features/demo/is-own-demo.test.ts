import { describe, expect, it } from "vitest";
import { hasOtherCompany, isOwnDemo } from "./is-own-demo";

const org = (over: Partial<{ id: string; slug: string; demo: boolean; demoOwned: boolean }>) => ({
  id: "c1",
  type: "shop" as const,
  name: "Shop",
  slug: "shop",
  timezone: "America/Phoenix",
  plan: "trial" as const,
  demo: false,
  demoOwned: false,
  printsInHouse: false,
  productionPartner: null,
  createdAt: "2026-09-25T00:00:00Z",
  ...over,
});

describe("sample shop", () => {
  it("is only the person's own demo, not any shop flagged demo", () => {
    expect(isOwnDemo({ org: org({ demo: true, demoOwned: true, slug: "demo-c1" }) })).toBe(true);
    expect(
      isOwnDemo({ org: org({ demo: true, demoOwned: false, slug: "desert-bloom-tees" }) }),
    ).toBe(false);
    // demoOwned is the source of truth, not the slug: a shop that happens to be named
    // `demo-c1` but isn't the caller's own sample workspace is not the sample shop.
    expect(isOwnDemo({ org: org({ demo: false, demoOwned: false, slug: "demo-c1" }) })).toBe(false);
  });

  it("offers leaving only when there is another company", () => {
    const me = { org: org({ demo: true, demoOwned: true, slug: "demo-c1" }), orgs: [] };
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

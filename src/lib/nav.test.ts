import { describe, expect, it } from "vitest";
import { activeNavKey, homePath, navFor } from "./nav";

const shop = {
  org: { type: "shop" as const },
  permissions: ["today.read", "orders.read", "catalog.read"] as never[],
};
const shopFinance = {
  org: { type: "shop" as const },
  permissions: ["today.read", "orders.read", "catalog.read", "finance.read"] as never[],
};
const vendor = {
  org: { type: "vendor" as const },
  permissions: ["vendor_portal.read", "team.read", "org.read"] as never[],
};

describe("navFor", () => {
  it("filters shop nav by permission and drops empty groups", () => {
    const groups = navFor(shop as never);
    const keys = groups.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain("orders");
    expect(keys).toContain("designs");
    expect(keys).not.toContain("profit");
    expect(keys).not.toContain("operations");
    expect(keys).not.toContain("inventory-health");
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("shows Operations and Inventory health under Analytics for finance.read roles", () => {
    const keys = navFor(shopFinance as never).flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain("operations");
    expect(keys).toContain("inventory-health");
  });

  it("gives vendor orgs the portal nav", () => {
    const keys = navFor(vendor as never).flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toEqual(["inbox", "shops", "company", "team"]);
    expect(homePath(vendor as never)).toBe("/vendor");
  });

  it("highlights the longest matching prefix", () => {
    const groups = navFor(shop as never);
    expect(activeNavKey(groups, "/")).toBe("today");
    expect(activeNavKey(groups, "/catalog/designs/abc")).toBe("designs");
    expect(activeNavKey(groups, "/orders")).toBe("orders");
  });
});

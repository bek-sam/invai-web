import type { Me, Permission } from "@invai/contracts";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  ClipboardList,
  CreditCard,
  Factory,
  FileSearch,
  Image,
  Inbox,
  Layers,
  LayoutDashboard,
  Link2,
  Megaphone,
  Package,
  PackageCheck,
  Palette,
  Plug,
  Receipt,
  RotateCcw,
  ScrollText,
  Shirt,
  ShoppingCart,
  Sparkles,
  Tablet,
  Truck,
  Type,
  Users,
  Warehouse,
} from "lucide-react";

export interface NavItem {
  key: string;
  to: string;
  labelKey: string;
  icon: LucideIcon;
  permission: Permission;
  /** Extra words for the command palette. */
  keywords?: string;
}

export interface NavGroup {
  labelKey?: string;
  items: NavItem[];
}

export const SHOP_NAV: NavGroup[] = [
  {
    items: [
      {
        key: "today",
        to: "/",
        labelKey: "nav.today",
        icon: LayoutDashboard,
        permission: "today.read",
        keywords: "home dashboard",
      },
      {
        key: "orders",
        to: "/orders",
        labelKey: "nav.orders",
        icon: ShoppingCart,
        permission: "orders.read",
      },
    ],
  },
  {
    labelKey: "nav.production",
    items: [
      {
        key: "sheets",
        to: "/production/sheets",
        labelKey: "nav.gangSheets",
        icon: Layers,
        permission: "production.read",
        keywords: "dtf build batch",
      },
      {
        key: "stations",
        to: "/production/stations",
        labelKey: "nav.stationsBoard",
        icon: Factory,
        permission: "production.read",
        keywords: "floor scans",
      },
      {
        key: "reprints",
        to: "/production/reprints",
        labelKey: "nav.reprints",
        icon: RotateCcw,
        permission: "production.read",
        keywords: "reprint misprint qc fail",
      },
      {
        key: "bins",
        to: "/production/bins",
        labelKey: "nav.bins",
        icon: Archive,
        permission: "production.read",
        keywords: "tote shelf labels",
      },
    ],
  },
  {
    labelKey: "nav.catalog",
    items: [
      {
        key: "designs",
        to: "/catalog/designs",
        labelKey: "nav.designs",
        icon: Image,
        permission: "catalog.read",
        keywords: "artwork print files",
      },
      {
        key: "blanks",
        to: "/catalog/blanks",
        labelKey: "nav.blanks",
        icon: Shirt,
        permission: "catalog.read",
        keywords: "shirts gildan bella",
      },
      {
        key: "products",
        to: "/catalog/products",
        labelKey: "nav.products",
        icon: Package,
        permission: "catalog.read",
      },
      {
        key: "sku",
        to: "/catalog/sku-mapping",
        labelKey: "nav.skuMapping",
        icon: Link2,
        permission: "sku_rules.read",
        keywords: "unmapped rules",
      },
      {
        key: "personalization",
        to: "/catalog/personalization",
        labelKey: "nav.personalization",
        icon: Type,
        permission: "personalization.read",
        keywords: "templates names",
      },
    ],
  },
  {
    labelKey: "nav.inventory",
    items: [
      {
        key: "stock",
        to: "/inventory/stock",
        labelKey: "nav.stock",
        icon: Boxes,
        permission: "inventory.read",
        keywords: "reorder low stock",
      },
      {
        key: "pos",
        to: "/inventory/purchase-orders",
        labelKey: "nav.purchaseOrders",
        icon: ClipboardList,
        permission: "purchasing.read",
        keywords: "po receive",
      },
    ],
  },
  {
    items: [
      {
        key: "shipping",
        to: "/shipping",
        labelKey: "nav.shipping",
        icon: Truck,
        permission: "shipping.read",
        keywords: "labels rates tracking",
      },
    ],
  },
  {
    labelKey: "nav.listings",
    items: [
      {
        key: "drafts",
        to: "/listings/drafts",
        labelKey: "nav.aiDrafts",
        icon: Sparkles,
        permission: "ai.listings.read",
        keywords: "etsy titles tags",
      },
      {
        key: "trademark",
        to: "/listings/trademark",
        labelKey: "nav.trademark",
        icon: FileSearch,
        permission: "ai.trademark.check",
        keywords: "ip risk",
      },
    ],
  },
  {
    labelKey: "nav.analytics",
    items: [
      {
        key: "profit",
        to: "/analytics/profit",
        labelKey: "nav.profit",
        icon: BarChart3,
        permission: "finance.read",
        keywords: "margin revenue",
      },
      {
        key: "ad-spend",
        to: "/analytics/ad-spend",
        labelKey: "nav.adSpend",
        icon: Megaphone,
        permission: "finance.read",
        keywords: "ads marketing campaign",
      },
    ],
  },
  {
    items: [
      {
        key: "assistant",
        to: "/assistant",
        labelKey: "nav.assistant",
        icon: Bot,
        permission: "ai.assistant.ask",
        keywords: "ask ai chat",
      },
    ],
  },
  {
    labelKey: "nav.settings",
    items: [
      {
        key: "company",
        to: "/settings/company",
        labelKey: "nav.company",
        icon: Building2,
        permission: "org.read",
      },
      {
        key: "team",
        to: "/settings/team",
        labelKey: "nav.team",
        icon: Users,
        permission: "team.read",
        keywords: "invite roles staff",
      },
      {
        key: "channels",
        to: "/settings/channels",
        labelKey: "nav.channels",
        icon: Plug,
        permission: "channels.read",
        keywords: "shopify etsy csv import",
      },
      {
        key: "shippingSettings",
        to: "/settings/shipping",
        labelKey: "nav.shippingSettings",
        icon: Truck,
        permission: "shipping.manage",
        keywords: "carrier label package ship-from address",
      },
      {
        key: "vendors",
        to: "/settings/vendors",
        labelKey: "nav.vendors",
        icon: PackageCheck,
        permission: "vendors.read",
        keywords: "dtf supplier",
      },
      {
        key: "inventorySettings",
        to: "/settings/inventory",
        labelKey: "nav.inventorySettings",
        icon: Warehouse,
        permission: "inventory.read",
        keywords: "blank supplier api key velocity reorder",
      },
      {
        key: "stationsSettings",
        to: "/settings/stations",
        labelKey: "nav.stations",
        icon: Tablet,
        permission: "stations.manage",
        keywords: "tablet token qr",
      },
      {
        key: "costs",
        to: "/settings/costs",
        labelKey: "nav.costs",
        icon: Receipt,
        permission: "finance.read",
        keywords: "fees labor",
      },
      {
        key: "billing",
        to: "/settings/billing",
        labelKey: "nav.billing",
        icon: CreditCard,
        permission: "billing.read",
        keywords: "plan usage",
      },
      {
        key: "audit",
        to: "/settings/audit",
        labelKey: "nav.audit",
        icon: ScrollText,
        permission: "audit.read",
        keywords: "log history",
      },
    ],
  },
];

export const VENDOR_NAV: NavGroup[] = [
  {
    items: [
      {
        key: "inbox",
        to: "/vendor",
        labelKey: "nav.sheetInbox",
        icon: Inbox,
        permission: "vendor_portal.read",
        keywords: "sheets",
      },
      {
        key: "shops",
        to: "/vendor/shops",
        labelKey: "nav.shops",
        icon: Palette,
        permission: "vendor_portal.read",
      },
    ],
  },
  {
    labelKey: "nav.settings",
    items: [
      {
        key: "company",
        to: "/settings/company",
        labelKey: "nav.company",
        icon: Building2,
        permission: "org.read",
      },
      {
        key: "team",
        to: "/settings/team",
        labelKey: "nav.team",
        icon: Users,
        permission: "team.read",
      },
    ],
  },
];

/** Groups filtered to what the role can see; empty groups are dropped. */
export function navFor(me: Pick<Me, "org" | "permissions">): NavGroup[] {
  const groups = me.org.type === "vendor" ? VENDOR_NAV : SHOP_NAV;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => me.permissions.includes(i.permission)) }))
    .filter((g) => g.items.length > 0);
}

/** Longest nav prefix wins, so /catalog/designs/123 highlights Designs. */
export function activeNavKey(groups: NavGroup[], pathname: string): string | null {
  let best: NavItem | null = null;
  for (const item of groups.flatMap((g) => g.items)) {
    const match =
      item.to === "/"
        ? pathname === "/"
        : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (match && (!best || item.to.length > best.to.length)) best = item;
  }
  return best?.key ?? null;
}

/** Where a user lands after sign-in: Today for shops, the inbox for vendors, else the first page they can open. */
export function homePath(me: Pick<Me, "org" | "permissions">): string {
  const first = navFor(me)[0]?.items[0];
  return first?.to ?? "/";
}

import {
  CHANNEL_RULES,
  type Channel,
  type ListingContent,
  type OrderItemState,
} from "@invai/contracts";
import i18n from "i18next";

/**
 * The app's chosen language (`i18n.language`, toggled independent of the browser/OS locale) as an
 * `Intl` locale for a short date: `es-MX` in Spanish so the month never renders as "sept" (T-20-2's
 * `weekOfLabel` precedent), `en-US` otherwise. `toLocaleDateString(undefined, ...)` reads the
 * runtime's default locale instead and was the B-207 bug: an English-OS browser with the app set
 * to Spanish still showed English weekday/month names (`e2e/digest-dates.spec.ts` AC1).
 */
function dateLocale(): string {
  return i18n.language?.startsWith("es") ? "es-MX" : "en-US";
}

export function formatInches(inches: number, digits = 1): string {
  return `${inches.toFixed(digits).replace(/\.0+$/, "")}″`;
}

/** 0.873 -> "87%" */
export function formatPct(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(dateLocale(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Buyer PII stays minimal in lists: first name only. */
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "—";
  const first = fullName.trim().split(/\s+/)[0];
  return first || "—";
}

/** "Wed Sep 24" style local date for YYYY-MM-DD strings, avoiding the UTC shift of `new Date(str)`. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** YYYY-MM-DD for a Date in local time. */
export function toDateInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** End of a local calendar day (YYYY-MM-DD) as an ISO timestamp. */
export function endOfDayIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).toISOString();
}

export function startOfDayIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).toISOString();
}

/** A period ending now and starting `days` days ago (at local midnight). */
export function lastNDays(days: number, now = new Date()): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return { from: start.toISOString(), to: now.toISOString() };
}

/** Count items per state, ordered by pipeline position, for a compact "2 ready · 1 on sheet" summary. */
export function summarizeStates(
  states: readonly OrderItemState[],
): { state: OrderItemState; count: number }[] {
  const order: OrderItemState[] = [
    "on_hold",
    "needs_mapping",
    "needs_artwork",
    "imported",
    "ready",
    "on_sheet",
    "transfer_in",
    "pressed",
    "packed",
    "shipped",
    "delivered",
    "cancelled",
  ];
  const counts = new Map<OrderItemState, number>();
  for (const s of states) counts.set(s, (counts.get(s) ?? 0) + 1);
  return order.filter((s) => counts.has(s)).map((s) => ({ state: s, count: counts.get(s) ?? 0 }));
}

export interface LiveIssue {
  field: "title" | "description" | "tags" | "bullets";
  severity: "error" | "warn";
  message: string;
  index: number | null;
}

/**
 * Client-side mirror of the channel listing limits (CHANNEL_RULES), for instant feedback
 * while editing. The server validator (ai.validate) stays the source of truth.
 */
export function validateListingLive(
  channel: Channel,
  content: Partial<ListingContent>,
): LiveIssue[] {
  const rules = CHANNEL_RULES[channel].listing;
  const issues: LiveIssue[] = [];
  const title = content.title ?? "";
  if (!title.trim())
    issues.push({ field: "title", severity: "error", message: "Title is required", index: null });
  if (title.length > rules.titleMax) {
    issues.push({
      field: "title",
      severity: "error",
      message: `Title is ${title.length} characters; ${CHANNEL_RULES[channel].label} allows ${rules.titleMax}`,
      index: null,
    });
  }
  const description = content.description ?? "";
  if (description.length > rules.descriptionMax) {
    issues.push({
      field: "description",
      severity: "error",
      message: `Description exceeds ${rules.descriptionMax.toLocaleString("en-US")} characters`,
      index: null,
    });
  }
  const tags = content.tags ?? [];
  if (rules.tagsMax === 0 && tags.length > 0) {
    issues.push({
      field: "tags",
      severity: "warn",
      message: `${CHANNEL_RULES[channel].label} does not use tags`,
      index: null,
    });
  } else if (tags.length > rules.tagsMax) {
    issues.push({
      field: "tags",
      severity: "error",
      message: `${tags.length} tags; ${CHANNEL_RULES[channel].label} allows ${rules.tagsMax}`,
      index: null,
    });
  }
  if (rules.tagMaxLen > 0) {
    tags.forEach((tag, i) => {
      if (tag.length > rules.tagMaxLen) {
        issues.push({
          field: "tags",
          severity: "error",
          message: `Tag "${tag}" is ${tag.length} characters; max ${rules.tagMaxLen}`,
          index: i,
        });
      }
    });
  }
  const lowerTags = tags.map((t) => t.trim().toLowerCase());
  lowerTags.forEach((t, i) => {
    if (t && lowerTags.indexOf(t) !== i) {
      issues.push({
        field: "tags",
        severity: "warn",
        message: `Duplicate tag "${tags[i]}"`,
        index: i,
      });
    }
  });
  const bullets = content.bullets ?? [];
  if (rules.bulletsMax > 0) {
    if (bullets.length > rules.bulletsMax) {
      issues.push({
        field: "bullets",
        severity: "error",
        message: `${bullets.length} bullets; max ${rules.bulletsMax}`,
        index: null,
      });
    }
    bullets.forEach((b, i) => {
      if (rules.bulletMaxLen > 0 && b.length > rules.bulletMaxLen) {
        issues.push({
          field: "bullets",
          severity: "error",
          message: `Bullet ${i + 1} is ${b.length} characters; max ${rules.bulletMaxLen}`,
          index: i,
        });
      }
    });
  }
  return issues;
}

/** Progress toward a supplier's free-freight line. */
export function freightProgress(
  subtotal: number,
  threshold: number,
): { ratio: number; shortfall: number } {
  if (threshold <= 0) return { ratio: 1, shortfall: 0 };
  return {
    ratio: Math.min(1, Math.max(0, subtotal / threshold)),
    shortfall: Math.max(0, threshold - subtotal),
  };
}

/** Dollars string from a form ("12.5", "$1,200") to integer cents; null when invalid. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

export function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Split a comma/newline separated tag string, trimming and dropping empties. */
export function parseTags(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Compact dollar axis labels: 1234 -> "$1.2k". Input is dollars, not cents. */
export function formatMoneyShort(dollars: number): string {
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Order numbers as "#1548"; channel numbers that already carry a "#" (Shopify) keep one. */
export function orderLabel(orderNo: string): string {
  return `#${orderNo.replace(/^#+/, "")}`;
}

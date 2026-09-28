import type { DigestInsight, SignalSource, Weekday } from "@invai/contracts";
import type { TFunction } from "i18next";
import { recommendationActionText } from "../market/recommendation-copy";

const WEEKDAY_OFFSET: Record<Weekday, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/** A weekday's long name in the app's language, from `Intl` (2026-09-28 is a known Monday). */
export function weekdayLabel(day: Weekday, lang: string): string {
  const date = new Date(2026, 8, 28 + WEEKDAY_OFFSET[day]);
  return new Intl.DateTimeFormat(lang.startsWith("es") ? "es" : "en", { weekday: "long" }).format(
    date,
  );
}

/** "7:00 AM" from a whole hour 6..10 (already local to the shop's time zone). */
export function hourLabel(hour: number, lang: string): string {
  const date = new Date(2000, 0, 1, hour, 0);
  return new Intl.DateTimeFormat(lang.startsWith("es") ? "es" : "en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** The IANA zone's long name ("Mountain Standard Time"), falling back to the raw zone string. */
export function timezoneLabel(timezone: string, lang: string): string {
  try {
    const parts = new Intl.DateTimeFormat(lang.startsWith("es") ? "es" : "en", {
      timeZone: timezone,
      timeZoneName: "long",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/**
 * The fixed action text per detector (spec `specs/weekly-digest.md` "Copy": D1..D7 action), built
 * only from `action.kind` + `action.params` — never free text (plan-review P1: every rendered
 * string comes from a template key plus formatted facts). A `market` insight delegates to T-18-5's
 * `recommendationActionText` on its own `recommendation` record so the two features share wording.
 */
export function digestActionText(
  t: TFunction,
  lang: string,
  insight: Pick<DigestInsight, "action" | "recommendation" | "templateKey" | "facts">,
  nicheLabel: (key: string) => string,
): string {
  const { kind, params } = insight.action;
  const channel = params.channel ? t(`channel.${params.channel}`, params.channel) : "";
  switch (kind) {
    case "reconnect_channel":
      return t("digest.action.reconnectChannel", "Reconnect {{channel}}", { channel });
    case "see_what_changed":
      return t("digest.action.seeWhatChanged", "See what changed");
    case "review_costs":
      return t("digest.action.reviewCosts", "Review {{costLine}} costs", {
        costLine: params.costLine ? costLineLabel(t, params.costLine) : "",
      });
    case "review_ads":
      return t("digest.action.reviewAds", "Review ads on {{channel}}", { channel });
    case "list_design":
      return t("digest.action.listDesign", "List {{design}} on {{channel}}", {
        design: params.designName ?? "",
        channel,
      });
    case "review_price":
      return t("digest.action.reviewPrice", "Review the price of {{design}}", {
        design: params.designName ?? "",
      });
    case "ship_overdue":
      return t("digest.action.shipOverdue", "Ship {{n}} overdue orders", { n: params.n ?? 0 });
    case "see_reprints":
      return t("digest.action.seeReprints", "See reprints");
    case "reorder_blank":
      return t("digest.action.reorderBlank", "Reorder {{blank}}", {
        blank: params.blankName ?? "",
      });
    case "market":
      return insight.recommendation
        ? recommendationActionText(t, lang, insight.recommendation, nicheLabel)
        : "";
    case "none":
      return digestWinText(t, lang, insight);
  }
}

/**
 * D3's cost-line word (`digest.costLine.*`, mirroring the backend email renderer's
 * `costLine.*` table in `invai-backend/src/modules/digest/render.ts`), never the raw
 * `CostLine` enum value (`channelFees`, `blankCost`, ...). An enum value this card doesn't
 * know about still gets a real English word via `fallback`, never the bare identifier.
 */
const COST_LINE_KEYS: Record<string, string> = {
  channelFees: "channel fee",
  blankCost: "blank",
  transferCost: "transfer",
  labelCost: "shipping label",
  packagingCost: "packaging",
  laborCost: "labor",
  adsCost: "ad",
  refunds: "refund",
};

function costLineLabel(t: TFunction, costLine: string): string {
  const fallback = COST_LINE_KEYS[costLine] ?? costLine;
  return t(`digest.costLine.${costLine}`, fallback);
}

/**
 * D8 win headline. `templateKey` is the real wire value the backend sends for every D8 win
 * (`invai-backend/src/modules/digest/detectors.ts:d8Wins`: both the best-net-week and the
 * on-time-record candidate use the literal `"D8 win"`); the two cases are told apart only by
 * which facts are present, exactly like the backend's own email renderer
 * (`render.ts:actionPart`'s `default` branch: `factOf(i, "d8.net")` truthy -> best net week,
 * else on-time rate). Anything that isn't a real `"D8 win"` insight, or has neither fact, falls
 * back to a generic celebration line rather than a raw key or blank space.
 */
export function digestWinText(
  t: TFunction,
  lang: string,
  insight: Pick<DigestInsight, "templateKey" | "facts">,
): string {
  if (insight.templateKey === "D8 win") {
    const lk = lang.startsWith("es") ? "es" : "en";
    const net = insight.facts.find((f) => f.id === "d8.net");
    if (net) {
      const weeks = insight.facts.find((f) => f.id === "d8.weeks");
      return t("digest.win.bestNetWeek", "Your best net week in {{n}} weeks: {{net}}", {
        n: weeks?.formatted[lk] ?? "",
        net: net.formatted[lk] ?? "",
      });
    }
    const onTimeRate = insight.facts.find((f) => f.id === "d8.onTimeRate");
    if (onTimeRate) {
      return t("digest.win.onTimeRecord", "Your best on-time rate yet: {{rate}}", {
        rate: onTimeRate.formatted[lk] ?? "",
      });
    }
  }
  return t("digest.win.generic", "Something worth celebrating this week.");
}

const SOURCE_LABEL_KEY: Record<SignalSource, string> = {
  own: "digest.source.own",
  census: "digest.source.census",
  google_trends: "digest.source.googleTrends",
  pinterest_trends: "digest.source.pinterestTrends",
  amazon_pricing: "digest.source.amazonPricing",
  amazon_brand_analytics: "digest.source.amazonBrandAnalytics",
  walmart_pricing: "digest.source.walmartPricing",
  jungle_scout: "digest.source.jungleScout",
};

const SOURCE_DEFAULT: Record<SignalSource, string> = {
  own: "Your own data",
  census: "Census",
  google_trends: "Google Trends",
  pinterest_trends: "Pinterest Trends",
  amazon_pricing: "Amazon pricing",
  amazon_brand_analytics: "Amazon Brand Analytics",
  walmart_pricing: "Walmart pricing",
  jungle_scout: "Jungle Scout",
};

/**
 * "Google Trends, week ending Sep 20" (spec Market watch: source, then the date it describes).
 * Formats the date from the app's chosen language (`i18n.language`), not the browser's locale.
 */
export function sourceDateText(
  t: TFunction,
  lang: string,
  source: SignalSource,
  asOf: string,
): string {
  const label = t(SOURCE_LABEL_KEY[source], SOURCE_DEFAULT[source]);
  const date = new Date(asOf).toLocaleDateString(lang.startsWith("es") ? "es" : "en", {
    month: "short",
    day: "numeric",
  });
  return t("digest.source.dateLine", "{{source}}, week ending {{date}}", { source: label, date });
}

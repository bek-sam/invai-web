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
  insight: Pick<DigestInsight, "action" | "recommendation" | "templateKey">,
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
        costLine: params.costLine ?? "",
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
      return digestWinText(t, insight);
  }
}

/**
 * D8 win headline. The contract's `templateKey` is a free string with no enumerated values and
 * the spec's Copy table has no win-shaped rows (only D1-D7 action rows), so these three keys are
 * this card's own choice (reported to the tech lead for T-19-3 to match or for a follow-up
 * contract enum). Anything else, including a key T-19-3 didn't coordinate on, falls back to a
 * generic celebration line rather than a raw key or blank space.
 */
export function digestWinText(t: TFunction, insight: Pick<DigestInsight, "templateKey">): string {
  switch (insight.templateKey) {
    case "win.best_net_week":
      return t("digest.win.bestNetWeek", "Best net week in a while. Nice work.");
    case "win.on_time_record":
      return t("digest.win.onTimeRecord", "Your best on-time rate on record.");
    case "win.design_milestone":
      return t("digest.win.designMilestone", "One of your designs hit a new milestone.");
    default:
      return t("digest.win.generic", "Something worth celebrating this week.");
  }
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

/** "Google Trends, week ending Sep 20" (spec Market watch: source, then the date it describes). */
export function sourceDateText(t: TFunction, source: SignalSource, asOf: string): string {
  const label = t(SOURCE_LABEL_KEY[source], SOURCE_DEFAULT[source]);
  const date = new Date(asOf).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return t("digest.source.dateLine", "{{source}}, week ending {{date}}", { source: label, date });
}

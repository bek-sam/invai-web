import type { MarketRecommendation } from "@invai/contracts";
import { formatMoney } from "@invai/ui";
import type { TFunction } from "i18next";

type Translate = TFunction;

/** Month name from a 1..12 number, in the given language. */
function monthName(month: number, lang: string): string {
  return new Intl.DateTimeFormat(lang.startsWith("es") ? "es" : "en", { month: "long" }).format(
    new Date(2000, month - 1, 1),
  );
}

function priceRange(minCents?: number, maxCents?: number, lang = "en"): string | null {
  if (minCents == null && maxCents == null) return null;
  if (minCents != null && maxCents != null && minCents !== maxCents) {
    return `${formatMoney(minCents, "USD", lang)}–${formatMoney(maxCents, "USD", lang)}`;
  }
  return formatMoney(minCents ?? maxCents ?? 0, "USD", lang);
}

/**
 * The fixed action text per rule (spec "Copy": R1..R5 action), filled from the recommendation's
 * own `params` (never free text, except R4's trademark-screened `ideas`). One R2/R3 candidate
 * price and one R1 channel list come from the stored record; the model does not invent wording.
 */
export function recommendationActionText(
  t: Translate,
  lang: string,
  rec: MarketRecommendation,
  nicheLabel: (key: string) => string,
): string {
  const p = rec.params;
  const design = p.designName ?? rec.target.designName ?? "";
  switch (rec.rule) {
    case "R1": {
      // Peak under way (wave 20, fixes wave 19 gate issue 1): a peak month with no act-by date
      // means the act-by date already passed and today is inside the peak, so there's nothing to
      // count down to -- "before {{peak}}" would read as if the peak were still ahead. `niche` is
      // the design's own niche (`params.niche`, set by the backend only for this case), not R4's
      // cross-design niche pointer.
      if (p.peakMonth != null && p.actByDate == null) {
        return t(
          "market.action.r1UnderWay",
          "The {{niche}} season is on now. Make sure {{design}} is listed and in stock.",
          { niche: p.niche ? nicheLabel(p.niche) : "", design },
        );
      }
      const channels = (p.channels ?? [])
        .map((c) => t(`channel.${c}`, c))
        .join(lang.startsWith("es") ? " y " : " and ");
      const peak = p.peakMonth
        ? monthName(p.peakMonth, lang)
        : p.actByDate
          ? new Date(p.actByDate).toLocaleDateString(lang.startsWith("es") ? "es" : "en")
          : "";
      return t(
        "market.action.r1",
        "List {{design}} on {{channels}} and stock {{blank}} before {{peak}}.",
        {
          design,
          channels: channels || t("market.channels.connected", "your connected channels"),
          blank: p.blankName ?? "",
          peak,
        },
      );
    }
    case "R2": {
      const price = priceRange(p.testPriceMinCents, p.testPriceMaxCents, lang) ?? "";
      const channel = p.channel ? t(`channel.${p.channel}`, p.channel) : "";
      return t("market.action.r2", "Test a price of {{price}} on {{channel}} for 2 weeks.", {
        price,
        channel,
      });
    }
    case "R3": {
      const floor = p.floorPriceCents != null ? formatMoney(p.floorPriceCents, "USD", lang) : "";
      return t("market.action.r3", "Raise {{design}} to at least {{floor}}, or stop its ads.", {
        design,
        floor,
      });
    }
    case "R4": {
      const niche = p.niche ? nicheLabel(p.niche) : "";
      return t("market.action.r4", "Make 1–2 new designs for the {{niche}} niche.", { niche });
    }
    case "R5":
      return t("market.action.r5", "Pause ads on {{design}} and move it down your list.", {
        design,
      });
    default:
      return "";
  }
}

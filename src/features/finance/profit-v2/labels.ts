import type { AnalyticsCostLine, LeakageComponent } from "@invai/contracts";
import type { TFunction } from "i18next";

/** The cost line that sank a losing order (AC-A2), or the biggest mover in a bridge. */
export function costLineLabel(t: TFunction, line: AnalyticsCostLine): string {
  switch (line) {
    case "channelFees":
      return t("profit.channelFees", "Channel fees");
    case "blankCost":
      return t("profit.blankCost", "Blanks");
    case "transferCost":
      return t("profit.transferCost", "Transfers");
    case "labelCost":
      return t("profit.labelCost", "Label");
    case "packagingCost":
      return t("profitV2.packagingCost", "Packaging");
    case "laborCost":
      return t("profitV2.laborCost", "Labor");
    case "adsCost":
      return t("profitV2.adsCost", "Ads");
    case "refunds":
      return t("profit.refunds", "Refunds");
    default:
      return line;
  }
}

/** A step of the leakage waterfall (AC-A3's neighbor, AC1's "Leakage waterfall" view). */
export function leakageComponentLabel(t: TFunction, component: LeakageComponent): string {
  switch (component) {
    case "discounts":
      return t("profitV2.discounts", "Discounts");
    case "fees":
      return t("profit.channelFees", "Channel fees");
    case "refunds":
      return t("profit.refunds", "Refunds");
    case "shippingLoss":
      return t("profitV2.shippingLoss", "Shipping loss");
    case "reprints":
      return t("profitV2.reprints", "Reprints");
    default:
      return component;
  }
}

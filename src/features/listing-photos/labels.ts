import type {
  ContrastWarning,
  GarmentType,
  PhotoBadRequestReason,
  PhotoCheckFailure,
  PhotoChecks,
  PhotoImage,
} from "@invai/contracts";
import { GARMENT_TYPES, TEMPLATE_VIEWS } from "@invai/contracts";
import type { TFunction } from "i18next";
import { errorInfo } from "../../lib/errors";

export type TemplateView = (typeof TEMPLATE_VIEWS)[number];

const GARMENT_LABELS: Record<GarmentType, (t: TFunction) => string> = {
  tee: (t) => t("garment.tee", "Tee"),
  hoodie: (t) => t("garment.hoodie", "Hoodie"),
  crewneck: (t) => t("garment.crewneck", "Crewneck"),
  tank: (t) => t("garment.tank", "Tank"),
};
export function garmentLabel(t: TFunction, g: GarmentType): string {
  return GARMENT_LABELS[g](t);
}
export const ALL_GARMENTS = GARMENT_TYPES;

const VIEW_LABELS: Record<TemplateView, (t: TFunction) => string> = {
  front_flat: (t) => t("photoView.front_flat", "Front flat"),
  folded: (t) => t("photoView.folded", "Folded"),
  back: (t) => t("photoView.back", "Back"),
  on_model_white: (t) => t("photoView.on_model_white", "On model (white)"),
};
export function viewLabel(t: TFunction, v: TemplateView): string {
  return VIEW_LABELS[v](t);
}
export const ALL_VIEWS = TEMPLATE_VIEWS;

const SKIP_REASON_LABELS: Record<string, (t: TFunction) => string> = {
  no_back_print_file: (t) => t("photos.skipNoBackPrint", "No back print file"),
  duplicate_color: (t) => t("photos.skipDuplicateColor", "Duplicate color"),
};
export function skipReasonLabel(t: TFunction, reason: string): string {
  return SKIP_REASON_LABELS[reason]?.(t) ?? reason;
}

export function contrastWarningMessage(t: TFunction, w: ContrastWarning): string {
  return w.kind === "light_on_light"
    ? t("photos.warnLightOnLight", "Light art on a light shirt is hard to see on {{blank}}.", {
        blank: w.blank.name,
      })
    : t("photos.warnDarkOnDark", "Dark art on a dark shirt is hard to see on {{blank}}.", {
        blank: w.blank.name,
      });
}

/**
 * Longest-side and minimum-fill numbers per preset, for plain-language messages only (mirrors
 * `invai-imaging/app/photos.py` `PRESETS`; the server is the source of truth for the actual
 * check -- `PhotoCheckFailure.detail` is null in phase A, report T-26-4). `fill_below_min` only
 * ever fires for `amazon_main`, so the 85% number is always correct where it's shown.
 */
const PRESET_MIN_PX: Record<string, number> = {
  amazon_main: 1600,
  amazon_alt: 1000,
  etsy: 2000,
  shopify: 2048,
  tiktok: 600,
  walmart: 1500,
};
const AMAZON_MAIN_MIN_FILL_PCT = 85;

type CheckMsg = (t: TFunction, img: PhotoImage, checks: PhotoChecks) => string;
const CHECK_MESSAGES: Partial<Record<string, CheckMsg>> = {
  background_not_white: (t) => t("photoCheck.background_not_white", "Background isn't pure white."),
  fill_below_min: (t, img, checks) => {
    const pct = checks.fillRatio != null ? Math.round(checks.fillRatio * 100) : null;
    return pct != null
      ? t("photoCheck.fill_below_min", "Product fills {{pct}}% ({{channel}} needs {{min}}%).", {
          pct,
          min: AMAZON_MAIN_MIN_FILL_PCT,
          channel: t(`channel.${img.channel}`, img.channel),
        })
      : t("photoCheck.fill_below_min_generic", "Product doesn't fill enough of the frame.");
  },
  too_small: (t, img, checks) => {
    const px = checks.longestSidePx;
    const min = PRESET_MIN_PX[img.preset];
    return px != null && min != null
      ? t("photoCheck.too_small", "Image is {{px}} px ({{channel}} needs at least {{min}} px).", {
          px,
          min,
          channel: t(`channel.${img.channel}`, img.channel),
        })
      : t("photoCheck.too_small_generic", "Image is too small for this channel.");
  },
  wrong_aspect: (t) => t("photoCheck.wrong_aspect", "This channel needs a square image."),
  design_larger_than_print_area: (t) =>
    t(
      "photoCheck.design_larger_than_print_area",
      "The design was scaled down to fit the print area.",
    ),
  illustration_not_photo: (t, img) =>
    t(
      "photoCheck.illustration_not_photo",
      "Drawn illustration: {{channel}} wants a photo for the main image.",
      { channel: t(`channel.${img.channel}`, img.channel) },
    ),
  design_drift: (t) =>
    t("photoCheck.design_drift", "The photo doesn't match the design closely enough."),
  region_changed: (t) =>
    t("photoCheck.region_changed", "The garment outline moved after this scene was generated."),
};

export function checkFailureMessage(
  t: TFunction,
  failure: PhotoCheckFailure,
  img: PhotoImage,
): string {
  const checks = img.checks;
  if (!checks) return t("photoCheck.unknown", "This photo didn't pass a check.");
  return (
    CHECK_MESSAGES[failure.code]?.(t, img, checks) ??
    t("photoCheck.unknown", "This photo didn't pass a check.")
  );
}

const REASON_MESSAGES: Partial<
  Record<PhotoBadRequestReason, (t: TFunction, count: number | null) => string>
> = {
  too_many_compositions: (t) =>
    t(
      "photoReason.too_many_compositions",
      "Too many photos requested at once. Choose fewer garments, colors or views.",
    ),
  view_not_available: (t) =>
    t("photoReason.view_not_available", "This view isn't available for this design."),
  design_archived: (t) =>
    t("photoReason.design_archived", "This design is archived. Restore it first."),
  no_print_file: (t) => t("photoReason.no_print_file", "This design has no print file yet."),
  not_approved: (t, count) =>
    count != null && count > 0
      ? t("photoReason.not_approved_count", "{{count}} photo still needs approval first.", {
          count,
        })
      : t("photoReason.not_approved", "Approve the photos first."),
  channel_mismatch: (t) =>
    t(
      "photoReason.channel_mismatch",
      "These photos were made for a different channel than that draft.",
    ),
  image_not_in_set: (t) => t("photoReason.image_not_in_set", "That photo isn't part of this set."),
  not_reviewable: (t) =>
    t("photoReason.not_reviewable", "That photo isn't ready for a decision yet."),
  not_shopify_connection: (t) =>
    t("photoReason.not_shopify_connection", "Choose a Shopify connection."),
  listing_not_on_connection: (t) =>
    t("photoReason.listing_not_on_connection", "That listing isn't on that connection."),
};

/** Maps `photos.*` errors (the 10 `BAD_REQUEST` reasons, the daily cap) to plain sentences. */
export function photoErrorMessage(t: TFunction, err: unknown): string {
  const info = errorInfo(err);
  if (info.code === "BAD_REQUEST") {
    const data = info.data as { reason?: string; count?: number | null } | null;
    const reason = data?.reason as PhotoBadRequestReason | undefined;
    const fn = reason ? REASON_MESSAGES[reason] : undefined;
    if (fn) return fn(t, data?.count ?? null);
  }
  if (info.code === "IMAGE_DAILY_CAP_REACHED") {
    const data = info.data as { cap?: number; used?: number } | null;
    return t(
      "photos.dailyCapReached",
      "Today's limit for AI scene photos is reached ({{used}}/{{cap}}). Try again after it resets.",
      { used: data?.used ?? 0, cap: data?.cap ?? 0 },
    );
  }
  return info.message;
}

import type { Design, DesignPlacement, QaIssue, QaIssueCode, QaRegion } from "@invai/contracts";

/*
 * Print-file check results (B-380 C4, spec print-file-checks.md "Copy"): which words an issue
 * gets, where its boxes go on the preview, what the QA panel shows and who may accept.
 * Pure logic; the components live in qa-panel.tsx.
 */

export type IssueCopy = { error: string; warn: string } | string;

/**
 * One entry per contract code. Typed as a Record so a code added to `QA_ISSUE_CODES` fails
 * typecheck here until it has words. The text is the English default of `t()`; the same keys are
 * in `scripts/i18n-extra-en.json` and the Spanish in `scripts/i18n-es.json`.
 */
export const ISSUE_COPY: Record<QaIssueCode, IssueCopy> = {
  low_dpi: {
    error:
      "The picture is too small for this print size and will look blurry. Upload a bigger file.",
    warn: "The picture is a little small for this print size and may look soft.",
  },
  soft_alpha: "The edges are soft and may print fuzzy. Clean up the edges if you can.",
  no_alpha:
    "This file has no transparent background, so a box may print around the art. Upload a PNG with a transparent background.",
  tiny_file: "This file is very small. It may be empty or damaged. Upload it again.",
  unreadable: "We could not read this file. Upload it again as a PNG.",
  thin_line: {
    error:
      "Some lines are too thin to print ({{inches}} in). Make them thicker and upload the file again.",
    warn: "Some lines are very thin ({{inches}} in) and may not hold.",
  },
  small_text: "Small text may fill in when printed. Make it bigger if you can.",
  white_box:
    "A white box surrounds the art and will print on dark shirts. Remove the white background.",
  non_srgb: "This file uses a different color profile, so colors may shift.",
};

export function appLocale(language: string | undefined): "es-MX" | "en-US" {
  return language?.startsWith("es") ? "es-MX" : "en-US";
}

/** Inches for the copy: locale decimals, at most 3, and a tiny value never shows as 0. */
export function formatMeasuredIn(value: number, locale: string): string {
  const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  if (value > 0 && Number(plain.replace(",", ".")) === 0) {
    return new Intl.NumberFormat(locale, { maximumSignificantDigits: 2 }).format(value);
  }
  return plain;
}

export interface IssueText {
  /** null for a code this app does not know (a newer API): show the server's `message`. */
  key: string | null;
  fallback: string;
  params: { inches?: string };
}

export function issueText(issue: QaIssue, locale: string): IssueText {
  const copy = (ISSUE_COPY as Partial<Record<string, IssueCopy>>)[issue.code];
  if (copy === undefined) return { key: null, fallback: issue.message, params: {} };
  const params =
    typeof copy === "string" || issue.measuredIn === undefined
      ? {}
      : { inches: formatMeasuredIn(issue.measuredIn, locale) };
  if (typeof copy === "string") {
    return { key: `qa.issue.${issue.code}`, fallback: copy, params };
  }
  return {
    key: `qa.issue.${issue.code}.${issue.severity}`,
    fallback: copy[issue.severity],
    params,
  };
}

/** List key: several boxes can share a code in a stale list, so add the index. */
export function issueListKey(issue: QaIssue, index: number): string {
  return `${issue.code}-${index}`;
}

export function formatAcceptedDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

// ---- overlay ---------------------------------------------------------------------------

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The preview sits in a square with `object-contain`, so the picture may be smaller than the
 * square. Returns the drawn picture as fractions (0..1) of the square.
 */
export function containRect(naturalWidth: number, naturalHeight: number): Box | null {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null;
  const aspect = naturalWidth / naturalHeight;
  return aspect >= 1
    ? { left: 0, top: (1 - 1 / aspect) / 2, width: 1, height: 1 / aspect }
    : { left: (1 - aspect) / 2, top: 0, width: aspect, height: 1 };
}

/**
 * A region (ratios of the file) as percentages of the square preview box. Clamped so the box
 * never leaves the drawn picture.
 */
export function regionToPercentBox(region: QaRegion, image: Box): Box {
  const left = clamp(region.left, 0, 1);
  const top = clamp(region.top, 0, 1);
  const width = clamp(region.width, 0, 1 - left);
  const height = clamp(region.height, 0, 1 - top);
  return {
    left: (image.left + left * image.width) * 100,
    top: (image.top + top * image.height) * 100,
    width: width * image.width * 100,
    height: height * image.height * 100,
  };
}

export function regionsOf(issue: QaIssue): QaRegion[] {
  return issue.regions ?? [];
}

// ---- panel state -----------------------------------------------------------------------

export type RunFailure = "unavailable" | "busy" | "other" | null;

/** How a failed runQa reads. Imaging down is UPSTREAM_FAILED; 429/503 get the "busy" words. */
export function classifyRunFailure(err: { code?: unknown; status?: unknown } | null): RunFailure {
  if (!err) return null;
  if (err.code === "UPSTREAM_FAILED") return "unavailable";
  if (err.code === "RATE_LIMITED" || err.status === 429 || err.status === 503) return "busy";
  return "other";
}

export type QaPanelMode = "checking" | "none" | "list" | "pending";

export function qaPanelMode(input: { checking: boolean; qa: DesignPlacement["qa"] }): QaPanelMode {
  if (input.checking) return "checking";
  if (input.qa.issues.length > 0) return "list";
  return input.qa.status === "pending" ? "pending" : "none";
}

export type QaCode = "QA_NOT_WARNING" | "QA_ISSUE_NOT_FOUND";

export function qaActionErrorCode(err: { code?: unknown } | null): QaCode | null {
  return err?.code === "QA_NOT_WARNING" || err?.code === "QA_ISSUE_NOT_FOUND" ? err.code : null;
}

export interface ControlState {
  /** Accept button + hint. */
  accept: boolean;
  /** "Undo accept" on the accepted line. */
  unaccept: boolean;
  accepted: boolean;
}

/** Who sees what on one issue. Errors never get Accept; office (no catalog.manage) gets none. */
export function issueControls(
  issue: QaIssue,
  opts: { canManage: boolean; checking: boolean },
): ControlState {
  const accepted = issue.acceptedAt !== undefined;
  return {
    accepted,
    accept: opts.canManage && !opts.checking && issue.severity === "warn" && !accepted,
    unaccept: opts.canManage && !opts.checking && accepted,
  };
}

/** The toast message and its action word, from one catalog string like "Warning accepted. Undo". */
export function splitToast(text: string): { message: string; action: string } {
  const m = /^(.*\.)\s+(\S+)$/.exec(text);
  return m?.[1] && m[2] ? { message: m[1], action: m[2] } : { message: text, action: "Undo" };
}

/** Merge a fresh design's QA into the editor's drafts, only for files that are still the same. */
export function mergeQa<
  P extends { placement: string; fileKey: string; qa: DesignPlacement["qa"] | null },
>(drafts: P[], design: Pick<Design, "placements">): P[] {
  return drafts.map((p) => {
    const fresh = design.placements.find(
      (x) => x.placement === p.placement && x.fileKey === p.fileKey,
    );
    return fresh ? { ...p, qa: fresh.qa } : p;
  });
}

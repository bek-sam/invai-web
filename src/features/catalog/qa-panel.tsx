import type { DesignPlacement, QaIssue } from "@invai/contracts";
import { Badge, Button, cn, Skeleton } from "@invai/ui";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QA_TONE } from "../../components/badges";
import { useSignedUrl } from "../../components/signed-image";
import {
  appLocale,
  type Box,
  containRect,
  formatAcceptedDate,
  issueControls,
  issueListKey,
  issueText,
  type QaCode,
  qaPanelMode,
  type RunFailure,
  regionsOf,
  regionToPercentBox,
} from "./print-checks";

/** Preview of a placement's art with optional boxes over the spots a check found. */
export function PlacementPreview({
  fileKey,
  alt,
  regions,
}: {
  fileKey: string | null;
  alt: string;
  regions: QaIssue["regions"][];
}) {
  const q = useSignedUrl(fileKey);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const base = "checkerboard relative aspect-square w-full overflow-hidden rounded-md";
  if (!fileKey || q.isError) return <div className={cn(base, "bg-muted")} title={alt} />;
  if (q.isPending) return <Skeleton className={base} />;
  const image: Box | null = natural ? containRect(natural.w, natural.h) : null;
  const boxes = image
    ? regions.flatMap((r) => (r ?? []).map((x) => regionToPercentBox(x, image)))
    : [];
  return (
    <div className={base}>
      <img
        src={q.data.url}
        alt={alt}
        loading="lazy"
        className="size-full object-contain"
        onLoad={(e) =>
          setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
      />
      {boxes.map((b, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: boxes have no id and never reorder
          key={i}
          data-testid="qa-region"
          aria-hidden
          className="pointer-events-none absolute rounded-sm border-2 border-danger bg-danger/15"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: `${b.width}%`,
            height: `${b.height}%`,
          }}
        />
      ))}
    </div>
  );
}

export interface QaPanelProps {
  qa: DesignPlacement["qa"];
  /** A check is running for this file (upload or Run QA). */
  checking: boolean;
  failure: RunFailure;
  canManage: boolean;
  /** Issue codes whose spots are drawn on the preview. */
  shown: ReadonlySet<string>;
  onToggleShown: (code: string) => void;
  onAccept: (code: QaIssue["code"]) => void;
  onUnaccept: (code: QaIssue["code"]) => void;
  onRetry: () => void;
  /** `${action}:${code}` of the accept/undo call in flight. */
  busyAction: string | null;
  actionError: { code: QaCode; issue: string } | null;
}

export function QaPanel(p: QaPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = appLocale(i18n.language);
  const mode = qaPanelMode({ checking: p.checking, qa: p.qa });
  return (
    <div className="text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Badge variant={QA_TONE[p.qa.status]}>{t(`qa.${p.qa.status}`, p.qa.status)}</Badge>
        {p.qa.effectiveDpi !== null && (
          <span className="text-muted-foreground">
            {t("designs.dpi", "{{dpi}} DPI at print size", { dpi: Math.round(p.qa.effectiveDpi) })}
          </span>
        )}
      </p>
      {mode === "checking" && (
        <p role="status" className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("qa.checking", "Checking your art...")}
        </p>
      )}
      {mode !== "checking" && p.failure && p.failure !== "other" && (
        <p role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-xs text-danger">
          {p.failure === "busy"
            ? t("qa.busy", "Too many checks right now. Try again in a minute.")
            : t("qa.unavailable", "We could not check this file. Try again in a minute.")}
          {p.canManage && (
            <Button variant="outline" size="sm" onClick={p.onRetry}>
              {t("qa.retry", "Check again")}
            </Button>
          )}
        </p>
      )}
      {mode === "none" && (
        <p className="mt-1 text-xs text-muted-foreground">{t("qa.none", "No problems found.")}</p>
      )}
      {p.actionError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {p.actionError.code === "QA_NOT_WARNING"
            ? t(
                "qa.error.QA_NOT_WARNING",
                "This problem must be fixed, so it cannot be accepted. Upload a fixed file.",
              )
            : t(
                "qa.error.QA_ISSUE_NOT_FOUND",
                "That problem is no longer in the list. Reload to see the latest check.",
              )}
        </p>
      )}
      {mode === "list" && (
        <ul className="mt-1 flex flex-col gap-2 text-xs">
          {p.qa.issues.map((i, idx) => {
            const text = issueText(i, locale);
            const c = issueControls(i, { canManage: p.canManage, checking: false });
            const spots = regionsOf(i).length;
            const busy = p.busyAction?.endsWith(`:${i.code}`) ?? false;
            return (
              <li
                key={issueListKey(i, idx)}
                data-testid="qa-issue"
                data-code={i.code}
                className="flex flex-col gap-1"
              >
                <span className={i.severity === "error" ? "text-danger" : "text-warning"}>
                  {text.key ? t(text.key, text.fallback, text.params) : text.fallback}
                </span>
                {spots > 0 && (
                  <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <span>{t("qa.regions", "{{count}} places", { count: spots })}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={p.shown.has(i.code)}
                      onClick={() => p.onToggleShown(i.code)}
                    >
                      {t("qa.showOnDesign", "Show on design")}
                    </Button>
                  </span>
                )}
                {c.accept && (
                  <span className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => p.onAccept(i.code)}
                    >
                      {busy && <Loader2 className="animate-spin" />}
                      {t("qa.accept", "Accept this warning")}
                    </Button>
                    <span className="text-muted-foreground">
                      {t(
                        "qa.acceptHint",
                        "Applies to this file only. If you replace the file, check it again.",
                      )}
                    </span>
                  </span>
                )}
                {c.accepted && i.acceptedAt && (
                  <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <span data-testid="qa-accepted">
                      {t("qa.accepted", "Accepted by {{name}} on {{date}}", {
                        name: i.acceptedBy ?? "",
                        date: formatAcceptedDate(i.acceptedAt, locale),
                      })}
                    </span>
                    {c.unaccept && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => p.onUnaccept(i.code)}
                      >
                        {t("qa.unaccept", "Undo accept")}
                      </Button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

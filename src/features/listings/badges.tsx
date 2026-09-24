import type { ListingDraftState, TrademarkCheck } from "@invai/contracts";
import { Badge, cn } from "@invai/ui";
import { useTranslation } from "react-i18next";

const TONE = {
  generating: "secondary",
  needs_review: "warning",
  approved: "success",
  rejected: "outline",
  publishing: "info",
  published: "success",
  failed: "danger",
} as const;

export function DraftStatusBadge({ status }: { status: ListingDraftState }) {
  const { t } = useTranslation();
  return (
    <Badge variant={TONE[status]}>{t(`draftState.${status}`, status.replace(/_/g, " "))}</Badge>
  );
}

/** Risk score + matched marks, with the "not legal advice" note. */
export function TrademarkResult({ check }: { check: TrademarkCheck }) {
  const { t } = useTranslation();
  const tone =
    check.riskLevel === "high"
      ? "text-danger"
      : check.riskLevel === "medium"
        ? "text-warning"
        : "text-success";
  const bar =
    check.riskLevel === "high"
      ? "bg-danger"
      : check.riskLevel === "medium"
        ? "bg-warning"
        : "bg-success";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className={cn("text-4xl font-semibold tabular-nums", tone)}>{check.riskScore}</div>
        <div className="flex-1">
          <p className={cn("font-medium", tone)}>
            {t(`tm.level.${check.riskLevel}`, `${check.riskLevel} risk`)}
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full", bar)} style={{ width: `${check.riskScore}%` }} />
          </div>
        </div>
      </div>
      <p className="text-sm">{check.explanation}</p>
      {check.ocrText && (
        <p className="text-xs text-muted-foreground">
          {t("designs.ocr", "Text found in the artwork")}: {check.ocrText}
        </p>
      )}
      {check.matches.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">{t("tm.mark", "Mark")}</th>
              <th className="py-1 text-left font-medium">{t("tm.matched", "Matched text")}</th>
              <th className="py-1 text-right font-medium">{t("tm.similarity", "Similarity")}</th>
              <th className="py-1 text-left font-medium pl-3">{t("tm.judgement", "Judgement")}</th>
            </tr>
          </thead>
          <tbody>
            {check.matches.map((m) => (
              <tr key={`${m.mark}-${m.matchedText}-${m.source}`} className="border-t border-border">
                <td className="py-1.5">
                  <span className="font-medium">{m.mark}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[m.owner, m.serialNo && `#${m.serialNo}`].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className="py-1.5">
                  “{m.matchedText}”{" "}
                  <span className="text-xs text-muted-foreground">
                    ({t(`tm.source.${m.source}`, m.source.replace(/_/g, " "))})
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {Math.round(m.similarity * 100)}%
                </td>
                <td className="py-1.5 pl-3">
                  {m.judgement ? (
                    <Badge
                      variant={
                        m.judgement === "conflict"
                          ? "danger"
                          : m.judgement === "possible"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {t(`tm.j.${m.judgement}`, m.judgement)}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted-foreground">
        {t("tm.disclaimer", "A risk signal from class-25 marks, not legal advice.")}
      </p>
    </div>
  );
}

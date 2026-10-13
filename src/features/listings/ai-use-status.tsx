import type { DesignAiUse, ListingDraftState } from "@invai/contracts";
import { Badge } from "@invai/ui";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * One line on a listing draft saying whether the AI notice is on it and why. It follows the
 * draft's own `designAiUse` (no second query). For a draft that is publishing or published the
 * stored content cannot tell "ai" from "unknown", so the line only says whether the notice went out.
 * Renders nothing when the API did not send the field.
 */
export function AiUseStatus({
  designAiUse,
  status,
  designLink,
}: {
  designAiUse: DesignAiUse | undefined;
  status: ListingDraftState;
  /** The "Say how it was made" link, passed only to people who can change the design. */
  designLink: ReactNode | null;
}) {
  const { t } = useTranslation();
  if (!designAiUse) return null;
  const muted = "text-xs text-muted-foreground";
  if (status === "publishing" || status === "published") {
    return (
      <p className={muted} data-testid="ai-use-status">
        {designAiUse === "none"
          ? t(
              "listings.aiUse.publishedWithout",
              "This draft was published without the AI-use notice.",
            )
          : t("listings.aiUse.publishedWith", "This draft was published with the AI-use notice.")}
      </p>
    );
  }
  if (designAiUse === "ai") {
    return (
      <p className={muted} data-testid="ai-use-status">
        {t("listings.aiUse.on", "Includes the AI notice: this design is marked made with AI.")}
      </p>
    );
  }
  if (designAiUse === "none") {
    return (
      <p className={muted} data-testid="ai-use-status">
        {t("listings.aiUse.off", "No AI notice. You marked this design as made without AI.")}
      </p>
    );
  }
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      data-testid="ai-use-status"
    >
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="size-3" aria-hidden />
        {t("listings.aiUse.unknownBadge", "Not set yet")}
      </Badge>
      <span className="text-muted-foreground">
        {t(
          "listings.aiUse.unknown",
          "Includes the AI notice because nobody said how this design was made.",
        )}
      </span>
      {designLink ?? (
        <span className="text-muted-foreground">
          {t("listings.aiUse.askOwner", "Ask the owner or designer.")}
        </span>
      )}
    </div>
  );
}

import { DESIGN_AI_USES, type DesignAiUse } from "@invai/contracts";
import { Label, RadioGroup, RadioGroupItem } from "@invai/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";

/** Label for one AI-use value, shared by the control, the toast and the read-only text. */
export function useAiUseLabel() {
  const { t } = useTranslation();
  return (v: DesignAiUse): string =>
    v === "none"
      ? t("designs.aiUse.none", "No, made without AI")
      : v === "ai"
        ? t("designs.aiUse.ai", "Yes, made with AI")
        : t("designs.aiUse.unknown", "Not set yet");
}

/**
 * "Made with AI?" on a design. Controlled by the stored value, so a failed save leaves the
 * stored choice selected. People who cannot manage the catalog (and archived designs) get the
 * value as plain text, not disabled radios.
 */
export function AiUseControl({
  value,
  canChange,
  saving,
  error,
  onSelect,
}: {
  value: DesignAiUse;
  canChange: boolean;
  saving: boolean;
  /** Text of the last failed save, shown in an alert until the next attempt. */
  error: string | null;
  onSelect: (next: DesignAiUse) => void;
}) {
  const { t } = useTranslation();
  const label = useAiUseLabel();
  const uid = useId();
  const helpId = `${uid}-help`;
  const help = (
    <p id={helpId} className="text-xs text-muted-foreground">
      {t(
        "designs.aiUse.help",
        "Until you choose No, your listings say this design was made with AI. Some marketplaces, such as Etsy, ask sellers to say when AI was used. Check each marketplace's current rules. Choose No only if no AI was used.",
      )}
    </p>
  );
  const none =
    value === "none" ? (
      <p className="text-xs text-muted-foreground">
        {t("designs.aiUse.noneNote", "This is your statement. InvAI does not check it.")}
      </p>
    ) : null;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" data-testid="ai-use">
      <legend className="mb-1.5 text-sm font-medium">
        {t("designs.aiUse.label", "Made with AI?")}
      </legend>
      {canChange ? (
        <>
          <RadioGroup
            value={value}
            disabled={saving}
            aria-describedby={helpId}
            onValueChange={(v) => {
              if (v !== value) onSelect(v as DesignAiUse);
            }}
          >
            {DESIGN_AI_USES.map((v) => (
              <div key={v} className="flex min-h-6 items-center gap-2">
                <RadioGroupItem id={`${uid}-${v}`} value={v} />
                <Label htmlFor={`${uid}-${v}`} className="font-normal">
                  {label(v)}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {help}
          {none}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm">{label(value)}</p>
          {help}
          {none}
          <p className="text-xs text-muted-foreground">
            {t("designs.aiUse.readOnly", "Only people who manage the catalog can change this.")}
          </p>
        </>
      )}
    </fieldset>
  );
}

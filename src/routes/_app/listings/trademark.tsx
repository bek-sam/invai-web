import type { Design } from "@invai/contracts";
import { Button, Textarea } from "@invai/ui";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileSearch, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Page, Section } from "../../../components/page";
import { DesignPicker } from "../../../components/pickers";
import { ErrorState } from "../../../components/states";
import { TrademarkResult } from "../../../features/listings/badges";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/listings/trademark")({
  component: TrademarkPage,
});

function TrademarkPage() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [design, setDesign] = useState<Design | null>(null);
  const check = useMutation(orpc.ai.trademarkCheck.mutationOptions({ meta: { silent: true } }));
  return (
    <Page
      wide={false}
      title={t("nav.trademark")}
      description={t(
        "tm.subtitle",
        "Check titles, tags or a design's artwork text against registered clothing marks.",
      )}
    >
      <div className="flex flex-col gap-4">
        <Section>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              check.mutate({ text: text.trim() || undefined, designId: design?.id });
            }}
          >
            <Field label={t("tm.text", "Text to check")} htmlFor="tm-text">
              <Textarea
                id="tm-text"
                rows={4}
                maxLength={5000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("tm.placeholder", "Title, tags, slogan…")}
              />
            </Field>
            <Field label={t("tm.orDesign", "And/or a design (checks text found in the artwork)")}>
              <DesignPicker value={design} onChange={setDesign} />
            </Field>
            <Button
              type="submit"
              className="self-start"
              disabled={(!text.trim() && !design) || check.isPending}
            >
              {check.isPending ? <Loader2 className="animate-spin" /> : <FileSearch />}
              {t("tm.check", "Check risk")}
            </Button>
          </form>
        </Section>
        {check.isError && <ErrorState error={check.error} />}
        {check.data && (
          <Section title={t("tm.result", "Result")}>
            <TrademarkResult check={check.data} />
          </Section>
        )}
      </div>
    </Page>
  );
}

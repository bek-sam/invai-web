import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { NotFoundState } from "../../components/states";
import { getHelpIndex } from "../../content/loader";
import { MarkdownBlocks } from "../../content/markdown-view";
import { PublicContentLayout } from "../../content/public-layout";

export const Route = createFileRoute("/help/")({
  component: HelpIndexPage,
});

function HelpIndexPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  const doc = getHelpIndex(lang);
  return (
    <PublicContentLayout>
      {doc ? <MarkdownBlocks blocks={doc.blocks} /> : <NotFoundState />}
    </PublicContentLayout>
  );
}

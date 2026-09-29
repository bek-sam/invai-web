import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotFoundState } from "../../components/states";
import { getHelpArticle } from "../../content/loader";
import { MarkdownBlocks } from "../../content/markdown-view";
import { PublicContentLayout } from "../../content/public-layout";
import { formatDate } from "../../lib/format";

export const Route = createFileRoute("/help/$slug")({
  component: HelpArticlePage,
});

function HelpArticlePage() {
  const { slug } = Route.useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  const article = getHelpArticle(lang, slug);

  if (!article) {
    return (
      <PublicContentLayout>
        <NotFoundState />
      </PublicContentLayout>
    );
  }

  // The parsed body still carries its own "# Title" as the first block (frontmatter.title mirrors
  // it); drop that one block so the article shows only one heading, not the same text twice.
  const bodyBlocks =
    article.blocks[0]?.kind === "heading" ? article.blocks.slice(1) : article.blocks;

  return (
    <PublicContentLayout>
      <Link
        to="/help"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("help.backToHelp", "Back to help")}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">{article.title}</h1>
      {article.updated && (
        <p className="mb-4 text-xs text-muted-foreground">
          {t("help.updated", "Updated {{date}}", { date: formatDate(article.updated) })}
        </p>
      )}
      <MarkdownBlocks blocks={bodyBlocks} />
    </PublicContentLayout>
  );
}

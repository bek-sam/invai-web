import { cn } from "@invai/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotFoundState } from "../../components/states";
import { getLegalDoc, LEGAL_SLUGS, type LegalSlug } from "../../content/loader";
import { MarkdownBlocks } from "../../content/markdown-view";
import { PublicContentLayout } from "../../content/public-layout";

export const Route = createFileRoute("/legal/$slug")({
  component: LegalDocPage,
});

function isLegalSlug(slug: string): slug is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(slug);
}

function LegalDocPage() {
  const { slug } = Route.useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  const doc = isLegalSlug(slug) ? getLegalDoc(lang, slug) : null;

  if (!doc) {
    return (
      <PublicContentLayout>
        <NotFoundState />
      </PublicContentLayout>
    );
  }

  // The body's own first block is the same "# Title" as doc.title; drop it so the page shows one heading.
  const bodyBlocks = doc.blocks[0]?.kind === "heading" ? doc.blocks.slice(1) : doc.blocks;

  return (
    <PublicContentLayout wide>
      <nav className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LEGAL_SLUGS.map((s) => {
          const label = getLegalDoc(lang, s)?.title ?? s;
          return (
            <Link
              key={s}
              to="/legal/$slug"
              params={{ slug: s }}
              className={cn(
                "underline-offset-2 hover:underline",
                s === slug ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
              aria-current={s === slug ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div
        role="status"
        className="mb-6 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t("legal.draftBanner", "Draft, pending legal review")}</span>
      </div>
      <h1 className="mb-4 text-2xl font-semibold">{doc.title}</h1>
      <MarkdownBlocks blocks={bodyBlocks} />
    </PublicContentLayout>
  );
}

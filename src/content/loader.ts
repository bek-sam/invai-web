import type { Lang } from "../i18n";
import { type Block, parseMarkdown } from "./markdown";

// Eagerly bundled at build time (committed copies, T-21-5 AC1) -- these pages need no API call.
const helpFiles = import.meta.glob("./help/*/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
const legalFiles = import.meta.glob("./legal/*/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function slugFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

function readFile(
  files: Record<string, string>,
  lang: Lang,
  dir: "help" | "legal",
  slug: string,
): string | null {
  return files[`./${dir}/${lang}/${slug}.md`] ?? null;
}

export interface HelpArticleSummary {
  slug: string;
  title: string;
}

export interface ParsedContent {
  slug: string;
  title: string;
  updated: string | null;
  blocks: Block[];
}

/** Every help article slug in a language, excluding the index page, sorted by filename. */
export function listHelpArticleSlugs(lang: Lang): string[] {
  const prefix = `./help/${lang}/`;
  return Object.keys(helpFiles)
    .filter((p) => p.startsWith(prefix) && !p.endsWith("/index.md"))
    .map(slugFromPath)
    .sort();
}

export function listHelpArticles(lang: Lang): HelpArticleSummary[] {
  return listHelpArticleSlugs(lang).map((slug) => {
    const source = readFile(helpFiles, lang, "help", slug) ?? "";
    const doc = parseMarkdown(source);
    return { slug, title: doc.title ?? slug };
  });
}

export function getHelpArticle(lang: Lang, slug: string): ParsedContent | null {
  const source = readFile(helpFiles, lang, "help", slug);
  if (source === null) return null;
  const doc = parseMarkdown(source);
  return {
    slug,
    title: doc.title ?? slug,
    updated: doc.frontmatter.updated ?? null,
    blocks: doc.blocks,
  };
}

/** The help center's own index.md, rendered as the `/help` page body (it already links every article). */
export function getHelpIndex(lang: Lang): ParsedContent | null {
  const source = readFile(helpFiles, lang, "help", "index");
  if (source === null) return null;
  const doc = parseMarkdown(source);
  return {
    slug: "index",
    title: doc.title ?? "Help",
    updated: doc.frontmatter.updated ?? null,
    blocks: doc.blocks,
  };
}

export const LEGAL_SLUGS = ["terms", "privacy", "dpa", "subprocessors"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function getLegalDoc(lang: Lang, slug: string): ParsedContent | null {
  const source = readFile(legalFiles, lang, "legal", slug);
  if (source === null) return null;
  const doc = parseMarkdown(source);
  return {
    slug,
    title: doc.title ?? slug,
    updated: doc.frontmatter.updated ?? null,
    blocks: doc.blocks,
  };
}

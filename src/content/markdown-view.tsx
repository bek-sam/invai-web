import { cn } from "@invai/ui";
import { Link } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { type Block, type Inline, isSafeAppPath } from "./markdown";

/**
 * Renders parsed help/legal Markdown as React elements only -- never `dangerouslySetInnerHTML`,
 * so there is nothing here for a stray HTML tag in the source to do (T-21-5, "no raw HTML from
 * markdown: sanitize or disallow").
 */
export function MarkdownBlocks({
  blocks,
  compact = false,
}: {
  blocks: Block[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col text-sm break-words",
        compact ? "gap-2 leading-snug" : "gap-4 leading-relaxed",
      )}
    >
      {blocks.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static content, re-parsed whole on every render
        <MarkdownBlock key={i} block={b} compact={compact} />
      ))}
    </div>
  );
}

function MarkdownBlock({ block, compact = false }: { block: Block; compact?: boolean }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${Math.min(block.level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
      const size = compact
        ? "text-sm font-semibold"
        : block.level <= 1
          ? "text-xl font-semibold"
          : block.level === 2
            ? "text-lg font-semibold"
            : "text-base font-semibold";
      return (
        <Tag className={cn(size, "mt-2 scroll-mt-20")}>
          <MarkdownInline nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className={compact ? "whitespace-pre-line" : undefined}>
          <MarkdownInline nodes={block.children} />
        </p>
      );
    case "hr":
      return <hr className="border-border" />;
    case "blockquote":
      return (
        <blockquote className="flex flex-col gap-3 rounded-md border-l-4 border-warning/60 bg-warning/10 py-2 pr-3 pl-4">
          {block.children.map((b, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static content
            <MarkdownBlock key={i} block={b} compact={compact} />
          ))}
        </blockquote>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          className={cn("flex flex-col gap-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}
        >
          {block.items.map((item, i) => (
            // A `list-item` <li> must keep the browser's default display to draw its own number
            // or bullet (`::marker` is only generated for `display: list-item`; `display: flex`
            // on the <li> itself silently drops it) -- the flex layout for its children lives on
            // an inner <div> instead (B-196: help-article lists must keep their numbers/bullets).
            // biome-ignore lint/suspicious/noArrayIndexKey: static content
            <li key={i} className="marker:text-muted-foreground">
              <div className="flex flex-col gap-1.5">
                {item.map((b, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static content
                  <MarkdownBlock key={j} block={b} compact={compact} />
                ))}
              </div>
            </li>
          ))}
        </ListTag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-md border border-border">
          <table
            className={cn(
              "border-collapse text-left text-xs",
              compact ? "w-max min-w-full" : "w-full min-w-[480px]",
            )}
          >
            <thead className="bg-muted/50">
              <tr>
                {block.header.map((cell, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static content
                  <th key={i} className="border-b border-border px-3 py-2 font-semibold">
                    <MarkdownInline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static content
                <tr key={i} className="border-b border-border last:border-0">
                  {row.map((cell, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static content
                    <td key={j} className="px-3 py-2 align-top">
                      <MarkdownInline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return <ImagePlaceholder alt={block.alt} />;
    default:
      return null;
  }
}

/**
 * Docs-writer's articles reference screenshots (`![alt](../img/.../01-x.png)`) that haven't been
 * produced yet -- no `invai-docs/help/img/**` exists (T-21-5 report, "Known gaps"). Pointing an
 * `<img>` at a path that 404s would fail this card's "no failed requests" bar, so this renders the
 * alt text as a labeled placeholder instead of a broken image. Swap for a real `<img>` once
 * docs-writer ships image files and a matching `sync-content.mjs` copy step.
 */
function ImagePlaceholder({ alt }: { alt: string }) {
  const { t } = useTranslation();
  return (
    <figure className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-muted-foreground">
      <ImageIcon className="size-5 shrink-0" aria-hidden />
      <figcaption className="text-xs">
        {t("help.screenshotLabel", "Screenshot")}
        {alt ? `: ${alt}` : ""}
      </figcaption>
    </figure>
  );
}

/** True for a same-article-set relative link like `sku-mapping.md`; help articles only ever link to each other this way. */
function isRelativeArticleLink(href: string): boolean {
  return /^[\w-]+\.md$/.test(href);
}

function MarkdownInline({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static content
        <Fragment key={i}>{renderInline(node)}</Fragment>
      ))}
    </>
  );
}

function renderInline(node: Inline): React.ReactNode {
  switch (node.kind) {
    case "text":
      return node.value;
    case "bold":
      return (
        <strong className="font-semibold">
          <MarkdownInline nodes={node.children} />
        </strong>
      );
    case "italic":
      return (
        <em>
          <MarkdownInline nodes={node.children} />
        </em>
      );
    case "code":
      // B-196: legal/help source has long unbroken tokens (file paths, env var names) inside
      // backticks; without a break rule an inline `<code>` doesn't wrap and pushes the whole
      // page wider than the 390 px viewport instead of scrolling its own content.
      return (
        <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {node.value}
        </code>
      );
    case "image":
      return <ImagePlaceholder alt={node.alt} />;
    case "link":
      if (isRelativeArticleLink(node.href)) {
        return (
          <Link
            to="/help/$slug"
            params={{ slug: node.href.replace(/\.md$/, "") }}
            className="text-primary underline underline-offset-2"
          >
            <MarkdownInline nodes={node.children} />
          </Link>
        );
      }
      if (node.internal && isSafeAppPath(node.href)) {
        return (
          <a href={node.href} className="text-primary underline underline-offset-2">
            <MarkdownInline nodes={node.children} />
          </a>
        );
      }
      return (
        <a
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          <MarkdownInline nodes={node.children} />
        </a>
      );
    default:
      return null;
  }
}

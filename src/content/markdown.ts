/**
 * A small, deliberately narrow Markdown parser for InvAI's own help and legal content
 * (invai-docs/help/**, invai-docs/legal/**), not user- or AI-generated text.
 *
 * Why hand-rolled instead of a library (architect review, T-21-5): the corpus was read in full
 * before writing this (17 articles, 4 legal drafts) and uses only headings (# / ##), paragraphs,
 * **bold**, *italic*, `code`, [text](link), standalone ![alt](src) images, blockquotes (including
 * a nested list inside one), ordered/unordered lists with one level of nesting, tables and
 * horizontal rules. This module covers exactly that set. It never interprets raw HTML: any `<`
 * or `>` character that isn't part of a blockquote marker is emitted as literal text, and
 * rendering (markdown-view.tsx) only ever builds React elements from the typed nodes below, never
 * `dangerouslySetInnerHTML` -- so there is no HTML-injection surface to sanitize, by construction.
 */

export type Inline =
  | { kind: "text"; value: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "image"; alt: string; src: string };

export type Block =
  | { kind: "heading"; level: number; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "hr" }
  | { kind: "blockquote"; children: Block[] }
  | { kind: "list"; ordered: boolean; items: Block[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "image"; alt: string; src: string };

export interface ParsedDocument {
  frontmatter: Record<string, string>;
  blocks: Block[];
  /** The text of the first heading; help articles and legal drafts both open with one. */
  title: string | null;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^-\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;
const UL_PREFIX_RE = /^-\s+/;
const OL_PREFIX_RE = /^\d+\.\s+/;
const TABLE_ROW_RE = /^\|.*\|\s*$/;
const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(([^)]*)\)$/;

function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

function isHr(trimmed: string): boolean {
  return /^-{3,}$/.test(trimmed);
}

function isTableSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|")) return false;
  const cells = t.slice(1, -1).split("|");
  return cells.length > 0 && cells.every((c) => /^\s*:?-{2,}:?\s*$/.test(c));
}

function splitTableRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith("|") && t.endsWith("|") ? t.slice(1, -1) : t;
  return inner.split("|").map((c) => c.trim());
}

/** Strips a leading `---\n...\n---` frontmatter block. Legal drafts don't have one; a no-op then. */
function stripFrontmatter(source: string): { data: Record<string, string>; body: string } {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m || m[1] === undefined) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv && kv[1] !== undefined) data[kv[1]] = (kv[2] ?? "").trim();
  }
  return { data, body: source.slice(m[0].length) };
}

/** Single-pass inline scanner: code spans are consumed verbatim so `` `(...)` `` never gets read as a link. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push({ kind: "text", value: buf });
      buf = "";
    }
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === undefined) break;
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push({ kind: "code", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const rest = src.slice(i);
    const img = rest.match(/^!\[([^\]]*)\]\(([^)\s]*)\)/);
    if (img) {
      flush();
      out.push({ kind: "image", alt: img[1] ?? "", src: img[2] ?? "" });
      i += img[0].length;
      continue;
    }
    const link = rest.match(/^\[([^\]]+)\]\(([^)\s]*)\)/);
    if (link) {
      flush();
      out.push({ kind: "link", href: link[2] ?? "", children: parseInline(link[1] ?? "") });
      i += link[0].length;
      continue;
    }
    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end !== -1) {
        flush();
        out.push({ kind: "bold", children: parseInline(rest.slice(2, end)) });
        i += end + 2;
        continue;
      }
    }
    if (ch === "*" && src[i + 1] !== "*") {
      const end = src.indexOf("*", i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        out.push({ kind: "italic", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Parses a block of already-dedented lines (indent 0 = "belongs to this block"). Recurses for
 * blockquotes and list items, whose content is dedented the same way before recursing. */
export function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push({ kind: "heading", level, children: parseInline(heading[2] ?? "") });
      i++;
      continue;
    }

    if (isHr(line.trim())) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      const quoted: string[] = [];
      let q = lines[i];
      while (i < lines.length && q !== undefined && q.startsWith(">")) {
        quoted.push(q.replace(/^>\s?/, ""));
        i++;
        q = lines[i];
      }
      blocks.push({ kind: "blockquote", children: parseBlocks(quoted) });
      continue;
    }

    const next = lines[i + 1];
    if (TABLE_ROW_RE.test(line) && next !== undefined && isTableSeparatorRow(next)) {
      const header = splitTableRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      let row = lines[i];
      while (i < lines.length && row !== undefined && TABLE_ROW_RE.test(row)) {
        rows.push(splitTableRow(row).map(parseInline));
        i++;
        row = lines[i];
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const imageOnly = line.trim().match(IMAGE_ONLY_RE);
    if (imageOnly) {
      blocks.push({ kind: "image", alt: imageOnly[1] ?? "", src: imageOnly[2] ?? "" });
      i++;
      continue;
    }

    if (UL_RE.test(line) || OL_RE.test(line)) {
      const ordered = OL_RE.test(line);
      const items: Block[][] = [];
      let marker = lines[i];
      while (i < lines.length && marker !== undefined) {
        const prefixMatch = marker.match(ordered ? OL_PREFIX_RE : UL_PREFIX_RE);
        if (!prefixMatch) break;
        const prefixLen = prefixMatch[0].length;
        const itemLines = [marker.slice(prefixLen)];
        i++;
        let cont = lines[i];
        while (
          i < lines.length &&
          cont !== undefined &&
          cont.trim() !== "" &&
          indentOf(cont) >= prefixLen
        ) {
          itemLines.push(cont.slice(prefixLen));
          i++;
          cont = lines[i];
        }
        items.push(parseBlocks(itemLines));
        marker = lines[i];
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paraLines: string[] = [];
    let p = lines[i];
    while (i < lines.length && p !== undefined) {
      if (p.trim() === "") break;
      if (
        HEADING_RE.test(p) ||
        isHr(p.trim()) ||
        p.startsWith(">") ||
        UL_RE.test(p) ||
        OL_RE.test(p) ||
        TABLE_ROW_RE.test(p) ||
        IMAGE_ONLY_RE.test(p.trim())
      )
        break;
      paraLines.push(p.trim());
      i++;
      p = lines[i];
    }
    blocks.push({ kind: "paragraph", children: parseInline(paraLines.join(" ")) });
  }
  return blocks;
}

function firstHeadingText(blocks: Block[]): string | null {
  for (const b of blocks) {
    if (b.kind === "heading") return inlineText(b.children);
  }
  return null;
}

export function inlineText(children: Inline[]): string {
  return children
    .map((c) => {
      if (c.kind === "text" || c.kind === "code") return c.value;
      if (c.kind === "image") return c.alt;
      return inlineText(c.children);
    })
    .join("");
}

export function parseMarkdown(source: string): ParsedDocument {
  const { data, body } = stripFrontmatter(source);
  const blocks = parseBlocks(body.replace(/\r\n/g, "\n").split("\n"));
  const title = data.title ?? firstHeadingText(blocks);
  return { frontmatter: data, blocks, title };
}

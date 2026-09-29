import { describe, expect, it } from "vitest";
import { inlineText, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("strips frontmatter and finds the title from it", () => {
    const doc = parseMarkdown(
      [
        "---",
        "title: Getting started",
        "slug: getting-started",
        "---",
        "",
        "# Getting started",
        "",
        "Body.",
      ].join("\n"),
    );
    expect(doc.frontmatter.title).toBe("Getting started");
    expect(doc.title).toBe("Getting started");
    expect(doc.blocks[0]).toEqual({
      kind: "heading",
      level: 1,
      children: [{ kind: "text", value: "Getting started" }],
    });
  });

  it("falls back to the first heading when there is no frontmatter (legal drafts)", () => {
    const doc = parseMarkdown("# InvAI Terms of Service\n\nSome body text.");
    expect(doc.frontmatter).toEqual({});
    expect(doc.title).toBe("InvAI Terms of Service");
  });

  it("parses bold, italic and inline code without mixing them up", () => {
    const doc = parseMarkdown("**Bold** then *italic* then `code(with parens)`.");
    const p = doc.blocks[0];
    if (p?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(p.children).toEqual([
      { kind: "bold", children: [{ kind: "text", value: "Bold" }] },
      { kind: "text", value: " then " },
      { kind: "italic", children: [{ kind: "text", value: "italic" }] },
      { kind: "text", value: " then " },
      { kind: "code", value: "code(with parens)" },
      { kind: "text", value: "." },
    ]);
  });

  it("never reads parentheses inside a code span as a link (the DPA's bracketed legal-entity placeholder)", () => {
    const doc = parseMarkdown(
      '`[[OWNER: InvAI\'s exact legal entity name and address (the "Processor")]]`',
    );
    const p = doc.blocks[0];
    if (p?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(p.children).toHaveLength(1);
    expect(p.children[0]).toEqual({
      kind: "code",
      value: '[[OWNER: InvAI\'s exact legal entity name and address (the "Processor")]]',
    });
  });

  it("resolves a markdown link to href and text", () => {
    const doc = parseMarkdown("See [SKU mapping](sku-mapping.md) for more.");
    const p = doc.blocks[0];
    if (p?.kind !== "paragraph") throw new Error("expected paragraph");
    const link = p.children.find((c) => c.kind === "link");
    expect(link).toEqual({
      kind: "link",
      href: "sku-mapping.md",
      children: [{ kind: "text", value: "SKU mapping" }],
    });
  });

  it("keeps a standalone image on its own line as a block, not inline text", () => {
    const doc = parseMarkdown("Some text.\n\n![Alt text](../img/x/01.png)\n\nMore text.");
    expect(doc.blocks.map((b) => b.kind)).toEqual(["paragraph", "image", "paragraph"]);
    const img = doc.blocks[1];
    if (img?.kind !== "image") throw new Error("expected image");
    expect(img).toEqual({ kind: "image", alt: "Alt text", src: "../img/x/01.png" });
  });

  it("parses an ordered list with a nested unordered list and wrapped continuation lines", () => {
    const md = [
      "1. First step.",
      "2. Second step.",
      "3. Save the file, then upload it where it goes:",
      "   - **Amazon:** one line.",
      "   - **Etsy:** a line that wraps",
      "     onto a second line.",
      "4. Fourth step.",
    ].join("\n");
    const doc = parseMarkdown(md);
    const list = doc.blocks[0];
    if (list?.kind !== "list") throw new Error("expected list");
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(4);
    const third = list.items[2];
    if (!third) throw new Error("expected a third item");
    expect(third[0]).toEqual({
      kind: "paragraph",
      children: [{ kind: "text", value: "Save the file, then upload it where it goes:" }],
    });
    const nested = third[1];
    if (nested?.kind !== "list") throw new Error("expected a nested list");
    expect(nested.ordered).toBe(false);
    expect(nested.items).toHaveLength(2);
    const etsy = nested.items[1];
    if (!etsy?.[0] || etsy[0].kind !== "paragraph") throw new Error("expected the Etsy paragraph");
    expect(inlineText(etsy[0].children)).toBe("Etsy: a line that wraps onto a second line.");
  });

  it("parses a blockquote containing two paragraphs and a bullet list (the legal draft banner)", () => {
    const md = [
      "> **DRAFT for counsel review.** Not in force.",
      ">",
      "> **Owner decisions needed:**",
      "> - `[[OWNER: entity name]]`",
      "> - `[[OWNER: address]]`",
    ].join("\n");
    const doc = parseMarkdown(md);
    const quote = doc.blocks[0];
    if (quote?.kind !== "blockquote") throw new Error("expected blockquote");
    expect(quote.children.map((b) => b.kind)).toEqual(["paragraph", "paragraph", "list"]);
    const list = quote.children[2];
    if (list?.kind !== "list") throw new Error("expected list");
    expect(list.items).toHaveLength(2);
  });

  it("parses a table with a header and body rows", () => {
    const md = ["| A | B |", "|---|---|", "| 1 | 2 |", "| 3 | 4 |"].join("\n");
    const doc = parseMarkdown(md);
    const table = doc.blocks[0];
    if (table?.kind !== "table") throw new Error("expected table");
    expect(table.header.map(inlineText)).toEqual(["A", "B"]);
    expect(table.rows.map((r) => r.map(inlineText))).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("parses a horizontal rule distinct from a list dash", () => {
    const doc = parseMarkdown("Above.\n\n---\n\nBelow.");
    expect(doc.blocks.map((b) => b.kind)).toEqual(["paragraph", "hr", "paragraph"]);
  });
});

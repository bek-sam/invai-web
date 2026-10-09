import { ITEM_ARTWORK_STATUSES } from "@invai/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantAnswer } from "../components/assistant-answer";
import { en } from "../i18n/en";
import { es } from "../i18n/es";
import { isSafeAppPath, parseMarkdown } from "./markdown";

const B270 = `Your profit went up because **fewer refunds** came in.

### What changed
- Refunds: down 40%
- Shipping: flat

1. Check the *Etsy* orders
2. Review labels

| Channel | Profit |
| --- | --- |
| Etsy | $120.00 |
| Shopify | $80.00 |`;

const html = (t: string) => renderToStaticMarkup(createElement(AssistantAnswer, { text: t }));

describe("AI markdown mode", () => {
  it("renders the B-270 answer as formatted elements with no literal markers", () => {
    const out = html(B270);
    expect(out).toContain("<strong");
    expect(out).toContain("<h4");
    expect(out).toContain("<ul");
    expect(out).toContain("<ol");
    expect(out).toContain("<table");
    expect(out).toContain("overflow-x-auto");
    expect(out).not.toContain("**");
    expect(out).not.toContain("###");
    expect(out).not.toContain("|");
  });

  it("keeps single line breaks in a paragraph (plain answers look as before)", () => {
    const out = html("Line one\nLine two");
    expect(out).toContain("Line one\nLine two");
    expect(out).toContain("whitespace-pre-line");
  });

  it("does not swallow an answer that starts with ---", () => {
    const out = html("---\ntitle: x\n---\nhello");
    expect(out).toContain("hello");
    expect(out).toContain("title: x");
  });

  it("a half-finished ** stays as text", () => {
    expect(html("Profit is **up")).toContain("**up");
  });

  it("never renders an image, even standalone or inline", () => {
    for (const src of [
      "![x](https://evil.test/?q=secret)",
      "see ![x](https://evil.test/a.png) here",
      "- ![x](https://evil.test/a.png)",
    ]) {
      const out = html(src);
      expect(out).not.toContain("<img");
      expect(out).not.toContain("evil.test");
    }
  });

  it("drops external and unsafe links to plain text, keeps in-app paths", () => {
    for (const href of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "mailto:a@b.test",
      "orders",
      "/ x",
    ]) {
      const out = html(`[click](${href})`);
      expect(out).not.toContain("<a");
      expect(out).toContain("click");
    }
    const ok = html("[Orders](/orders)");
    expect(ok).toContain('<a href="/orders"');
    expect(ok).not.toContain("_blank");
    expect(isSafeAppPath("/orders/abc?x=1")).toBe(true);
    expect(isSafeAppPath("//x")).toBe(false);
  });

  it("keeps raw HTML literal", () => {
    const out = html("<script>alert(1)</script><img src=x onerror=alert(1)>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("content mode is unchanged: images, links and frontmatter as before", () => {
    const doc = parseMarkdown("---\ntitle: T\n---\n![a](b.png)\n\n[x](https://e.test)");
    expect(doc.title).toBe("T");
    expect(doc.blocks[0]?.kind).toBe("image");
    expect(parseMarkdown("a\nb").blocks[0]).toMatchObject({ kind: "paragraph" });
  });
});

describe("artwork status labels", () => {
  it("has English and Spanish text for every status, including purged", () => {
    for (const s of ITEM_ARTWORK_STATUSES) {
      expect((en.artworkStatus as Record<string, string>)[s]).toBeTruthy();
      expect((es.artworkStatus as Record<string, string>)[s]).toBeTruthy();
    }
    expect(en.artworkStatus.purged).toBe("Removed for privacy");
    expect(es.artworkStatus.purged).toBe("Eliminado por privacidad");
  });
});

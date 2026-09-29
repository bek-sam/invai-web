import { describe, expect, it } from "vitest";
import { getHelpArticle, getLegalDoc, LEGAL_SLUGS, listHelpArticleSlugs } from "./loader";

// T-21-5 AC1: fails if `pnpm sync:content` ever copies a help article or legal draft into one
// language's folder but not the other -- a missing translation would otherwise 404 silently.
describe("content language parity", () => {
  it("has the same help article slugs in en and es", () => {
    const en = listHelpArticleSlugs("en");
    const es = listHelpArticleSlugs("es");
    expect(en.length).toBeGreaterThan(0);
    expect(es).toEqual(en);
  });

  it("has a non-empty article for every en help slug in both languages", () => {
    for (const slug of listHelpArticleSlugs("en")) {
      expect(getHelpArticle("en", slug), `en/${slug}`).not.toBeNull();
      expect(getHelpArticle("es", slug), `es/${slug}`).not.toBeNull();
    }
  });

  it("has every legal document in both languages", () => {
    for (const slug of LEGAL_SLUGS) {
      expect(getLegalDoc("en", slug), `legal en/${slug}`).not.toBeNull();
      expect(getLegalDoc("es", slug), `legal es/${slug}`).not.toBeNull();
    }
  });
});

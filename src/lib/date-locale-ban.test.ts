import { describe, expect, it } from "vitest";

/**
 * B-225: `toLocaleDateString(undefined, ...)` / `toLocaleString(undefined, ...)` read the
 * runtime's default locale instead of the app's chosen language (`i18n.language`), which showed
 * English weekday/month names to a Spanish-set user on an English-OS browser
 * (`lib/format.ts`'s `dateLocale()` comment, `digest-copy.ts`'s `weekOfLabel` comment). Block it
 * from coming back anywhere in `src/`, not just the one screen this card fixed
 * (`routes/_app/index.tsx`'s greeting date).
 */
const BANNED = /\.toLocale(?:Date)?String\(\s*undefined\b/g;

/** Strips block comments so an explanatory comment about the ban (this file, `lib/format.ts`,
 * `digest-copy.ts`) is never itself counted as a violation. */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function findBannedCalls(text: string): string[] {
  return [...stripBlockComments(text).matchAll(BANNED)].map((m) => m[0]);
}

// Eagerly bundled as raw text at test-build time (same pattern as `content/loader.ts`), so this
// check needs no Node `fs` access (this app has no `@types/node`). Excludes this file itself:
// its fixture strings below contain the banned text as plain string literals, not code.
const SRC_FILES = import.meta.glob("../**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function scanSrc(): { file: string; match: string }[] {
  const hits: { file: string; match: string }[] = [];
  for (const [file, text] of Object.entries(SRC_FILES)) {
    if (file.includes("date-locale-ban.test")) continue;
    for (const match of findBannedCalls(text)) hits.push({ file, match });
  }
  return hits;
}

describe("date-locale ban (B-225)", () => {
  it("flags a planted raw call in a fixture string", () => {
    const fixture = 'new Date().toLocaleDateString(undefined, { month: "short" })';
    expect(findBannedCalls(fixture)).toEqual([".toLocaleDateString(undefined"]);
  });

  it("flags the toLocaleString form too, and ignores an explanatory comment about it", () => {
    const fixture = [
      "/** never toLocaleDateString(undefined, ...) -- see B-225 */",
      "x.toLocaleString(undefined, {})",
    ].join("\n");
    expect(findBannedCalls(fixture)).toEqual([".toLocaleString(undefined"]);
  });

  it("the real src tree has none", () => {
    expect(scanSrc()).toEqual([]);
  });
});

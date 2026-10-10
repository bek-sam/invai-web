import { describe, expect, it } from "vitest";
import shopRoute from "../../routes/_app/production/sheets.$sheetId.tsx?raw";
import vendorRoute from "../../routes/_app/vendor/sheets.$sheetId.tsx?raw";

// Web tests are node .test.ts files without jsdom, so this asserts source order:
// the note must follow the last action button so the buttons stay on the first row.
const ROUTES: [string, string][] = [
  ["production/sheets.$sheetId.tsx", shopRoute],
  ["vendor/sheets.$sheetId.tsx", vendorRoute],
];

describe("sheet screens keep the action buttons on one row", () => {
  for (const [route, src] of ROUTES) {
    it(`${route}: PrintFilesNote comes after the last action button`, () => {
      const start = src.indexOf('<div className="flex flex-wrap gap-2">');
      const note = src.indexOf("<PrintFilesNote");
      expect(start).toBeGreaterThan(-1);
      expect(note).toBeGreaterThan(start);
      const dialogs = src.search(/\{shipOpen &&|\{sendOpen &&/);
      const end = dialogs > note ? dialogs : src.length;
      const rowBefore = src.slice(start, note);
      const rowAfter = src.slice(note, end);
      expect(rowBefore.match(/<Button\b/g)?.length).toBeGreaterThan(2);
      expect(rowAfter).not.toMatch(/<Button\b|<ResendEmailButton/);
      expect(src.match(/<PrintFilesNote/g)).toHaveLength(1);
    });
  }
});

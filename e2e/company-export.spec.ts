import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers/api";
import { loginAs, settled } from "./helpers/ui";

/**
 * T-34-5: Settings > Company > "Download all your data" (T-34-3). The owner starts an export, it
 * reaches "ready", and Download yields a URL that answers 200 with a zip. Office never sees the
 * section. The spec makes its own precondition: it starts a fresh export (a running one is
 * followed by the screen itself), and it relies on no other spec.
 */
const OFFICE = { email: "office@desertbloom.test", password: "demo1234!" };

test("owner prepares a data export, it becomes ready and the download answers 200 with a zip", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await loginAs(page, OWNER);
  await page.goto("/settings/company");
  await settled(page);
  const section = page.getByTestId("company-export");
  await expect(section).toBeVisible();

  await section.getByTestId("company-export-start").click();

  const download = section.getByTestId("company-export-download");
  await expect(download).toBeVisible({ timeout: 60_000 });
  await expect(
    section.getByText(/Your export is ready\.|Tu exportación está lista\./),
  ).toBeVisible();

  // The Download button asks files.downloadUrl for a signed link, then opens it.
  const signed = page.waitForResponse(
    (r) => r.url().includes("files/downloadUrl") || r.url().includes("files.downloadUrl"),
  );
  await download.click();
  const res = await signed;
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { url?: string; json?: { url?: string } };
  const url = body.json?.url ?? body.url;
  expect(url, "files.downloadUrl returned a url").toBeTruthy();

  const file = await page.request.get(url as string);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toMatch(/zip/);
  const bytes = await file.body();
  // A zip starts with "PK".
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
});

test("office does not see the data export section", async ({ page }) => {
  await loginAs(page, OFFICE);
  await page.goto("/settings/company");
  await settled(page);
  // The page itself loaded (its Profile section is there), so an absent export section means gated.
  await expect(page.getByText(/^(Profile|Perfil)$/).first()).toBeVisible();
  await expect(page.getByTestId("company-export")).toHaveCount(0);
});

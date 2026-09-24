import { expect, type Page } from "@playwright/test";
import { OWNER, VENDOR } from "./api";

export type PageIssue = { kind: "console" | "request"; url: string; detail: string };

/** Collect console errors and failed / 5xx requests for the life of the page. */
export function watchPage(page: Page, ignore: RegExp[] = []): PageIssue[] {
  const issues: PageIssue[] = [];
  const skip = (text: string) => ignore.some((re) => re.test(text));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (skip(text)) return;
    issues.push({ kind: "console", url: page.url(), detail: text.slice(0, 500) });
  });
  page.on("pageerror", (err) => {
    if (skip(err.message)) return;
    issues.push({ kind: "console", url: page.url(), detail: `pageerror: ${err.message}` });
  });
  page.on("requestfailed", (req) => {
    const text = `${req.method()} ${req.url()} ${req.failure()?.errorText ?? ""}`;
    if (skip(text)) return;
    issues.push({ kind: "request", url: page.url(), detail: text });
  });
  page.on("response", (res) => {
    if (res.status() < 400) return;
    const text = `${res.status()} ${res.request().method()} ${res.url()}`;
    if (skip(text)) return;
    issues.push({ kind: "request", url: page.url(), detail: text });
  });
  return issues;
}

export async function loginAs(page: Page, user = OWNER) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

export const loginAsVendor = (page: Page) => loginAs(page, VENDOR);

/**
 * Wait until the screen has finished its first load: no skeletons or spinners left. (Not
 * `networkidle`: the live-updates SSE stream keeps a request open for the life of the page.)
 */
export async function settled(page: Page, timeout = 10_000) {
  // A plain locator: an open drawer marks <main> aria-hidden, which hides it from getByRole.
  await expect(page.locator("main").first()).toBeVisible();
  await expect
    .poll(async () => page.locator("[data-slot=skeleton], .animate-spin").count(), {
      timeout,
    })
    .toBe(0)
    .catch(() => {});
}

import { expect, type Page, type Request } from "@playwright/test";
import { OWNER, VENDOR } from "./api";

export type PageIssue = { kind: "console" | "request"; url: string; detail: string };

const ASK_PATH = "/rpc/ai/assistant/ask";

/** Collect console errors and failed / 5xx requests for the life of the page. */
export function watchPage(page: Page, ignore: RegExp[] = []): PageIssue[] {
  const issues: PageIssue[] = [];
  const skip = (text: string) => ignore.some((re) => re.test(text));
  // B-132: every streamed `ai.assistant.ask` call gets a 200 with the full SSE body -- the
  // answer's chips, sources and recommendations are already in the DOM -- and only then does
  // the oRPC client's event-iterator cancel its reader, which Chrome reports as an aborted
  // request. Confirmed directly against a real ask (200, full content rendered, then exactly
  // one `net::ERR_ABORTED` on the same request, nothing else after). Root-cause follow-up:
  // ai-engineer/architect (the streaming transport), tracked as B-132. This allow-lists only
  // that one shape, and only for a request we ourselves saw complete with 200 first, so an
  // abort before completion (a real failure: navigation away, a crashed stream) still fails.
  const completedAsk = new WeakSet<Request>();
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
    const isAllowedAskAbort =
      req.method() === "POST" &&
      new URL(req.url()).pathname === ASK_PATH &&
      req.failure()?.errorText === "net::ERR_ABORTED" &&
      completedAsk.has(req);
    if (isAllowedAskAbort) return; // B-132, see comment above; nothing else is allow-listed.
    if (skip(text)) return;
    issues.push({ kind: "request", url: page.url(), detail: text });
  });
  page.on("response", (res) => {
    if (
      res.request().method() === "POST" &&
      res.status() === 200 &&
      new URL(res.url()).pathname === ASK_PATH
    ) {
      completedAsk.add(res.request());
    }
    if (res.status() < 400) return;
    const text = `${res.status()} ${res.request().method()} ${res.url()}`;
    if (skip(text)) return;
    issues.push({ kind: "request", url: page.url(), detail: text });
  });
  return issues;
}

export async function loginAs(page: Page, user = OWNER) {
  await page.goto("/login");
  // The label is "Email"/"Password" in English, "Correo"/"Contraseña" once `invai.lang=es` is
  // set before this navigation (the login page itself is translated, unlike the app shell).
  await page.getByLabel(/^(Email|Correo)$/).fill(user.email);
  await page.getByLabel(/^(Password|Contraseña)$/).fill(user.password);
  await page.getByRole("button", { name: /^(Sign in|Iniciar sesión)$/ }).click();
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
  const busy = page.locator("[data-slot=skeleton], .animate-spin");
  // toPass retries the callback and, on timeout, rethrows whatever it last threw -- so the
  // failure names the count and URL instead of being swallowed (gate-rootcause.md §1).
  await expect(async () => {
    const count = await busy.count();
    if (count > 0) {
      throw new Error(
        `settled(): ${count} skeleton/spinner element(s) still present at ${page.url()}`,
      );
    }
  }).toPass({ timeout });
}

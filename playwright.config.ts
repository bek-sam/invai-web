import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real stack: api :3000, worker, imaging :8000, web :5173 and a
 * freshly seeded dev database (`pnpm db:reset && pnpm db:migrate && pnpm db:seed` in
 * invai-backend). Start everything with `invai-infra/scripts/dev.sh`, then `pnpm e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  // The API-only golden path pins backend behaviour and consumes the same seeded orders as the
  // browser golden path, so it runs on its own: `E2E_API=1 pnpm e2e e2e/api-golden-path.spec.ts`
  // right after a fresh seed.
  testIgnore: process.env.E2E_API ? [] : ["**/api-golden-path.spec.ts"],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Both paths must sit outside invai-web/, not just under e2e/: the live :5173 Vite dev server
  // this suite runs against watches the whole project tree (no server.watch.ignored) and force
  // full-page-reloads every open tab when Playwright writes trace/report files mid-run, stalling
  // rendering long enough to blow the step timeout (A1 gate step 6, invai-docs/waves/A1/reports/
  // gate-step6-qa.md). "../.e2e-out/invai-web" resolves next to invai-web/, never inside it.
  reporter: [["list"], ["html", { open: "never", outputFolder: "../.e2e-out/invai-web/report" }]],
  outputDir: "../.e2e-out/invai-web/results",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

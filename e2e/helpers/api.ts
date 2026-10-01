import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, type Contract } from "@invai/contracts";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:3000";
export const WEB_ORIGIN = process.env.E2E_WEB_URL ?? "http://localhost:5173";
export const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const BACKEND = path.join(WORKSPACE, "invai-backend");
export const FIXTURES = path.join(BACKEND, "src/integrations/channels/csv/fixtures");

export const OWNER = { email: "owner@desertbloom.test", password: "demo1234!" };
export const VENDOR = { email: "vendor@suncitydtf.test", password: "demo1234!" };
export const PRESSER_PIN = "1155";

export type Api = ContractRouterClient<Contract>;

/** A cookie jar + typed oRPC client, so a test can act as a user, a station or a floor session. */
export class Session {
  private cookies = new Map<string, string>();
  headers: Record<string, string> = {};
  readonly api: Api;

  constructor(headers: Record<string, string> = {}) {
    this.headers = headers;
    const link = new RPCLink({
      url: `${API_URL}/rpc`,
      fetch: (req, init) => this.fetch(req, init),
    });
    this.api = createORPCClient(link);
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : {}));
    headers.set("origin", WEB_ORIGIN);
    const cookie = this.cookieHeader();
    if (cookie) headers.set("cookie", cookie);
    for (const [k, v] of Object.entries(this.headers)) headers.set(k, v);
    const res = await fetch(input, { ...init, headers });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair?.indexOf("=") ?? -1;
      if (pair && eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return res;
  }

  async auth(pathname: string, body: unknown) {
    const res = await this.fetch(`${API_URL}/api/auth/${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`auth ${pathname} failed (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
  }
}

export async function signIn(email: string, password: string): Promise<Session> {
  const s = new Session();
  await s.auth("sign-in/email", { email, password });
  return s;
}

/** Creates a brand new company the way the web sign-up page does. */
export async function signUpCompany(company: string): Promise<{ session: Session; email: string }> {
  const s = new Session();
  const nonce = Math.random().toString(36).slice(2, 8);
  const email = `e2e-${nonce}@example.test`;
  await s.auth("sign-up/email", { email, password: "e2e-pass-1234!", name: "E2E Owner" });
  const org = await s.auth("organization/create", { name: company, slug: `e2e-${nonce}` });
  await s.auth("organization/set-active", { organizationId: org.id });
  return { session: s, email };
}

export function stationSession(token: string): Session {
  return new Session({
    authorization: `Station ${token}`,
    [CONTRACT_VERSION_HEADER]: CONTRACT_VERSION,
  });
}

export function floorSession(sessionToken: string): Session {
  return new Session({
    authorization: `Bearer ${sessionToken}`,
    [CONTRACT_VERSION_HEADER]: CONTRACT_VERSION,
  });
}

export function seedOutput(): {
  shopId: string;
  vendorOrgId: string;
  stationToken: { station: string; token: string };
} {
  // E2E_SEED_OUTPUT_FILE lets a run against a scratch DB read its own seed's output (the backend's
  // `SEED_OUTPUT_FILE`) instead of the shared `invai-backend/seed-output.json`, which belongs to a
  // different company id on a scratch stack and fails floor/station auth (flagged, unfixed, in
  // waves/23/reports/T-23-8.md and waves/A1/reports/T-A1-report.md; this file is QA-owned).
  const file = process.env.E2E_SEED_OUTPUT_FILE ?? path.join(BACKEND, "seed-output.json");
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Turn off auto-import on every API connection that currently has it on, so the channel poller
 * (`POLL_EVERY_MS` = 10 min, `invai-backend/src/modules/channels/jobs.ts`) can't add a mock order
 * to the sheet-build pool mid-suite (B-255). Call once in `beforeAll`; pass the returned ids to
 * `restoreAutoImport` in `afterAll` (pass or fail) so the connection is left exactly as found.
 *
 * Residual window: a sync job already queued (or enqueued by a poll tick landing between this
 * call and the next) before the hold is read by `syncConnection` still runs to completion --
 * `syncConnection` doesn't re-check `autoImport` once its job is queued (`sync.ts`) -- so one
 * import of the mock's next 1-3 orders can still land up to `POLL_EVERY_MS` (plus this
 * connection's fixed jitter, `pollJitterMs`) after the hold takes effect. The API suite's step 5
 * is immune regardless: it builds from the preview's own `orderItemIds`, not from "every ready
 * item at build time".
 */
export async function holdAutoImport(ownerApi: Api): Promise<string[]> {
  const { items } = await ownerApi.channels.list({});
  const on = items.filter((c) => c.mode === "api" && c.settings.autoImport);
  await Promise.all(
    on.map((c) => ownerApi.channels.update({ id: c.id, settings: { autoImport: false } })),
  );
  return on.map((c) => c.id);
}

/** Restore exactly the connections `holdAutoImport` turned off. */
export async function restoreAutoImport(ownerApi: Api, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => ownerApi.channels.update({ id, settings: { autoImport: true } })),
  );
}

/** Upload a local file through files.presignUpload and return its key. */
export async function uploadFile(
  s: Session,
  kind: "csv" | "design" | "artwork",
  filePath: string,
  contentType: string,
) {
  const bytes = readFileSync(filePath);
  const presigned = await s.api.files.presignUpload({
    kind,
    filename: path.basename(filePath),
    contentType,
    sizeBytes: bytes.byteLength,
  });
  const put = await fetch(presigned.uploadUrl, {
    method: presigned.method ?? "PUT",
    headers: presigned.headers ?? { "content-type": contentType },
    body: bytes,
  });
  if (!put.ok) throw new Error(`upload failed (${put.status}) ${await put.text()}`);
  return presigned.fileKey;
}

export async function poll<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  { timeoutMs = 60_000, everyMs = 750, label = "condition" } = {},
): Promise<T> {
  const started = Date.now();
  let last: T | undefined;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last)?.slice(0, 500)}`);
}

export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

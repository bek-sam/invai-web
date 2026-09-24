import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Contract } from "@invai/contracts";
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
  return new Session({ authorization: `Station ${token}` });
}

export function floorSession(sessionToken: string): Session {
  return new Session({ authorization: `Bearer ${sessionToken}` });
}

export function seedOutput(): {
  shopId: string;
  vendorOrgId: string;
  stationToken: { station: string; token: string };
} {
  return JSON.parse(readFileSync(path.join(BACKEND, "seed-output.json"), "utf8"));
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

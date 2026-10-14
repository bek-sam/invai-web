// Shared helpers for the k6 scale scripts (T-55-3). k6 runs inside the grafana/k6 container;
// nothing here is imported by Playwright, Vitest or the Vite build.
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";

export const BASE = __ENV.BASE_URL || "http://host.docker.internal:3155";
export const ORIGIN = __ENV.WEB_ORIGIN || "http://localhost:5173";
export const CONTRACT_VERSION = __ENV.CONTRACT_VERSION || "0.19.0";

/** Creds file written by `pnpm db:seed:scale` (SEED_OUTPUT_FILE), mounted read-only at /creds.json. */
export function loadCreds() {
  return JSON.parse(open(__ENV.CREDS_FILE || "/creds.json"));
}

/** Per-scenario metrics: latency only for 2xx, 429 and 5xx counted apart (architect A3.9). */
export function metricsFor(name) {
  return {
    lat: new Trend(`${name}_latency_2xx`, true),
    ok: new Counter(`${name}_2xx`),
    limited: new Counter(`${name}_429`),
    server: new Counter(`${name}_5xx`),
    other: new Counter(`${name}_other`),
    notServerError: new Rate(`${name}_non5xx`),
  };
}

export function record(m, res) {
  m.notServerError.add(res.status < 500);
  if (res.status >= 200 && res.status < 300) {
    m.ok.add(1);
    m.lat.add(res.timings.duration);
  } else if (res.status === 429) m.limited.add(1);
  else if (res.status >= 500) m.server.add(1);
  else m.other.add(1);
}

export function headers(extra) {
  return Object.assign(
    { "x-contract-version": CONTRACT_VERSION, origin: ORIGIN, "content-type": "application/json" },
    extra || {},
  );
}

/** One password sign-in; returns a Cookie header value. Keep callers at <= 3 per run (20/min/IP). */
export function passwordSignIn(email, password) {
  const res = http.post(`${BASE}/api/auth/sign-in/email`, JSON.stringify({ email, password }), {
    headers: headers(),
    jar: null,
  });
  if (res.status !== 200) throw new Error(`sign-in ${email} failed: ${res.status} ${res.body}`);
  const pairs = [];
  for (const name of Object.keys(res.cookies)) pairs.push(`${name}=${res.cookies[name][0].value}`);
  if (pairs.length === 0) throw new Error("sign-in returned no cookie");
  return pairs.join("; ");
}

export function getJson(path, authHeaders, tags) {
  return http.get(`${BASE}${path}`, { headers: headers(authHeaders), jar: null, tags });
}

// Dashboard reads on the largest seeded tenant: today.summary plus orders.list with paging.
// Open model. DASH_RATE requests/s for DASH_DURATION (steady), or MODE=breakpoint for a ramp.
// Thresholds are the SLO table (interactive p95 < 400 ms, availability >= 99.5% non-5xx), on 2xx only.
import { sleep } from "k6";
import { BASE, getJson, loadCreds, metricsFor, passwordSignIn, record } from "./lib.k6.js";

const breakpoint = __ENV.MODE === "breakpoint";
const rate = Number(__ENV.DASH_RATE || 3);
const duration = __ENV.DASH_DURATION || "10m";
const m = metricsFor("dash");

export const options = {
  setupTimeout: "60s",
  scenarios: {
    dashboard: breakpoint
      ? {
          executor: "ramping-arrival-rate",
          startRate: 1,
          timeUnit: "1s",
          preAllocatedVUs: 40,
          maxVUs: 200,
          stages: JSON.parse(
            __ENV.STAGES ||
              '[{"target":2,"duration":"1m"},{"target":4,"duration":"1m"},{"target":6,"duration":"1m"},{"target":8,"duration":"1m"},{"target":12,"duration":"1m"},{"target":20,"duration":"1m"}]',
          ),
        }
      : {
          executor: "constant-arrival-rate",
          rate,
          timeUnit: "1s",
          duration,
          preAllocatedVUs: 20,
          maxVUs: 100,
        },
  },
  thresholds: breakpoint
    ? { dash_non5xx: ["rate>0.995"] }
    : {
        dash_latency_2xx: ["p(95)<400"],
        dash_non5xx: ["rate>0.995"],
      },
};

export function setup() {
  const creds = loadCreds();
  const email = __ENV.DASH_EMAIL || creds.logins.office || creds.logins.owner;
  return { cookie: passwordSignIn(email, creds.logins.password) };
}

let cursor = null;

export default function (data) {
  const auth = { cookie: data.cookie };
  const pick = Math.random();
  let res;
  if (pick < 0.34) {
    res = getJson("/api/v1/today", auth, { proc: "today.summary" });
  } else if (pick < 0.67 || !cursor) {
    res = getJson("/api/v1/orders?limit=50", auth, { proc: "orders.list" });
    if (res.status === 200) cursor = res.json("nextCursor");
  } else {
    res = getJson(`/api/v1/orders?limit=50&cursor=${encodeURIComponent(cursor)}`, auth, {
      proc: "orders.list.page2",
    });
    cursor = res.status === 200 ? res.json("nextCursor") : null;
  }
  record(m, res);
  sleep(0);
}

export function handleSummary(data) {
  return { stdout: JSON.stringify({ base: BASE, metrics: summarize(data) }, null, 2) };
}

function summarize(data) {
  const out = {};
  for (const [k, v] of Object.entries(data.metrics)) {
    if (k.startsWith("dash_") || k === "http_reqs") out[k] = v.values;
  }
  return out;
}

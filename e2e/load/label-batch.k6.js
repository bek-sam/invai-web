// Label batch on the mock carrier: batch-buy BATCH_SIZE packed orders, poll the job, record
// enqueue -> done seconds (target p95 < 60 s). This proves our code on the mock carrier, not EasyPost.

import { sleep } from "k6";
import http from "k6/http";
import { Trend } from "k6/metrics";
import { BASE, headers, loadCreds, metricsFor, passwordSignIn, record } from "./lib.k6.js";

const m = metricsFor("label");
const done = new Trend("label_job_seconds", true);
const batchSize = Number(__ENV.BATCH_SIZE || 25);
const batches = Number(__ENV.BATCHES || 4);

export const options = {
  setupTimeout: "60s",
  scenarios: {
    labels: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: batches,
      maxDuration: "15m",
    },
  },
  thresholds: { label_job_seconds: ["p(95)<60000"], label_non5xx: ["rate>0.995"] },
};

export function setup() {
  const creds = loadCreds();
  const cookie = passwordSignIn(creds.logins.owner, creds.logins.password);
  const q = http.get(`${BASE}/api/v1/shipping/queue?limit=${batchSize * batches}`, {
    headers: headers({ cookie }),
    jar: null,
  });
  if (q.status !== 200) throw new Error(`queue ${q.status}`);
  const ids = q.json("items").map((e) => e.orderId || e.order?.id);
  return { cookie, ids };
}

export default function (data) {
  const slice = data.ids.slice(__ITER * batchSize, (__ITER + 1) * batchSize);
  if (slice.length === 0) return;
  const start = Date.now();
  const res = http.post(`${BASE}/api/v1/shipping/batch-buy`, JSON.stringify({ orderIds: slice }), {
    headers: headers({ cookie: data.cookie }),
    jar: null,
    tags: { proc: "shipping.batchBuy" },
  });
  record(m, res);
  if (res.status !== 200) return;
  const jobId = res.json("jobId");
  for (let i = 0; i < 120; i++) {
    const j = http.get(`${BASE}/api/v1/production/jobs/${jobId}`, {
      headers: headers({ cookie: data.cookie }),
      jar: null,
    });
    const st = j.status === 200 ? j.json("status") : null;
    if (st === "completed" || st === "done" || st === "failed") {
      done.add(Date.now() - start);
      return;
    }
    sleep(1);
  }
}

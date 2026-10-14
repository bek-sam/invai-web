// Label batch on the mock carrier: batch-buy BATCH_SIZE packed orders, poll the job, record
// enqueue -> done seconds (target p95 < 60 s). This proves our code on the mock carrier, not EasyPost.

import { sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";
import { BASE, creds, headers, metricsFor, record, sessionCookie } from "./lib.k6.js";

const m = metricsFor("label");
// Timing is added only for a real success (job done with at least one label); every other outcome
// (429/4xx/5xx on batch-buy, poll limit hit, failed job, done with 0 labels, empty slice) is a
// label_batch_ok failure, so the run cannot pass on a batch that bought nothing.
const done = new Trend("label_job_seconds", true);
const ok = new Rate("label_batch_ok");
const batchSize = Number(__ENV.BATCH_SIZE || 25);
const batches = Number(__ENV.BATCHES || 4);

export const options = {
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  setupTimeout: "60s",
  scenarios: {
    labels: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: batches,
      maxDuration: "15m",
    },
  },
  thresholds: {
    label_job_seconds: ["p(95)<60000"],
    label_batch_ok: ["rate==1"],
    label_non5xx: ["rate>0.995"],
  },
};

export function setup() {
  const cookie = sessionCookie(
    creds.logins.owner.replace("owner1", "office1"),
    creds.logins.password,
  );
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
  if (slice.length === 0) {
    ok.add(false);
    return;
  }
  const start = Date.now();
  const res = http.post(`${BASE}/api/v1/shipping/batch-buy`, JSON.stringify({ orderIds: slice }), {
    headers: headers({ cookie: data.cookie }),
    jar: null,
    tags: { proc: "shipping.batchBuy" },
  });
  record(m, res);
  if (res.status !== 200) {
    ok.add(false);
    return;
  }
  const jobId = res.json("jobId");
  for (let i = 0; i < 120; i++) {
    const j = http.get(`${BASE}/api/v1/production/jobs/${jobId}`, {
      headers: headers({ cookie: data.cookie }),
      jar: null,
    });
    const st = j.status === 200 ? j.json("status") : null;
    if (st === "done" || st === "failed") {
      const labels = st === "done" ? j.json("resultIds").length : 0;
      const good = st === "done" && labels > 0;
      ok.add(good);
      if (good) done.add(Date.now() - start);
      return;
    }
    sleep(1);
  }
  ok.add(false);
}

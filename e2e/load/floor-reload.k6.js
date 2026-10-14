// Floor storm with the queue-reload read load (T-57-3). Each tablet VU replays, on a seeded
// Poisson schedule shared by both phases, its own scans (POST production.scan) and the queue
// reloads the floor makes after every realtime event (GET production.queue, 200 items).
// MODEL=debounce is base floor 0997119 (trailing 400 ms, reset by every event); MODEL=throttle is
// d178c93 (T-57-4). The model lives in reload-model.js (unit check: reload-model.check.mjs).
// Replay executor: one iteration per tablet (per-vu-iterations) that sleeps until each planned
// time, i.e. an open model: a slow answer never delays the next planned request (late ones fire
// at once and the lag is recorded in reload_lag_ms). 429 is counted apart; latency on 2xx only.

import { sleep } from "k6";
import exec from "k6/execution";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";
import { BASE, creds, headers, metricsFor, record } from "./lib.k6.js";
import { poissonScans, tabletPlans } from "./reload-model.js";

const nTablets = Number(__ENV.STATIONS || 20);
const durationSec = Number(__ENV.RUN_SECONDS || 600);
const scansPerMin = Number(__ENV.SCANS_PER_MIN || 400);
const seed = Number(__ENV.SEED || 57);
const model = __ENV.MODEL || "debounce";
// MODEL=throttle defaults to 0 (queue reads must never be refused); debounce stays report-only
// (it is expected to fail there). READS_429_MAX overrides either way.
const reads429Max = __ENV.READS_429_MAX || (model === "throttle" ? "0" : undefined);
const scan = metricsFor("scan");
const reload = metricsFor("reload");
const reads429 = new Counter("reads_429");
const reloadsPlanned = new Counter("reload_planned");
const scan429Rate = new Rate("scan_429_rate");
const lag = new Trend("reload_lag_ms", true);

export const options = {
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  setupTimeout: "10m",
  scenarios: {
    tablets: {
      executor: "per-vu-iterations",
      vus: nTablets,
      iterations: 1,
      maxDuration: `${durationSec + 180}s`,
    },
  },
  thresholds: Object.assign(
    {
      scan_429_rate: ["rate==0"], // B-489: no scan may be refused
      scan_latency_2xx: ["p(95)<300", "p(99)<600"],
      scan_non5xx: ["rate>0.995"],
      reload_non5xx: ["rate>0.995"],
    },
    reads429Max === undefined || reads429Max === "" ? {} : { reads_429: [`count<=${reads429Max}`] },
  ),
};

function uuid() {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += h[8 + Math.floor(Math.random() * 4)];
    else s += h[Math.floor(Math.random() * 16)];
  }
  return s;
}

export function setup() {
  const pins = creds.floor.members.map((x) => x.pin);
  const sessions = [];
  const stations = creds.floor.stations.slice(0, nTablets);
  for (let i = 0; i < stations.length; i++) {
    const res = http.post(
      `${BASE}/api/v1/floor/login`,
      JSON.stringify({ pin: pins[i % pins.length] }),
      { headers: headers({ authorization: `Station ${stations[i].token}` }), jar: null },
    );
    if (res.status !== 200) throw new Error(`station ${i} login ${res.status}`);
    const j = res.json();
    sessions.push({ bearer: j.sessionToken, kind: j.station.kind, stationId: j.station.id });
    sleep(4); // 15 logins/min against the 20/min auth bucket
  }
  const targets = creds.floor.scanTargets;
  if (!targets || targets.length === 0) throw new Error("no scan targets");
  const scans = poissonScans(seed, scansPerMin / 60, durationSec, nTablets);
  const { loads, plans } = tabletPlans(scans, nTablets, model);
  console.log(
    `model=${model} seed=${seed} scans=${scans.length} loadsPerTablet=${loads.length} ` +
      `(${((loads.length / durationSec) * 60).toFixed(1)}/min) offered=${((loads.length * nTablets) / durationSec) * 60}/min`,
  );
  // The schedule starts when the scenario starts, not now (setup took minutes).
  return { sessions, plans, targets, nScans: scans.length };
}

export default function (data) {
  const me = exec.vu.idInTest - 1;
  const s = data.sessions[me];
  const start = exec.scenario.startTime;
  const queueStation = s.kind;
  for (const op of data.plans[me]) {
    const wait = start + op.t - Date.now();
    if (wait > 0) sleep(wait / 1000);
    if (op.k === "load") {
      const res = http.get(`${BASE}/api/v1/production/queue?station=${queueStation}&limit=200`, {
        headers: headers({ authorization: `Bearer ${s.bearer}` }),
        jar: null,
        tags: { proc: "production.queue" },
      });
      lag.add(Math.max(0, Date.now() - (start + op.t)));
      reloadsPlanned.add(1);
      record(reload, res);
      if (res.status === 429) reads429.add(1);
    } else {
      // Blocked path (no blank): admission is the bucket's decision before the handler, and
      // the accepted-path queue is used up after one storm (wave 56).
      const body = {
        clientScanId: uuid(),
        station: "press",
        stationId: s.stationId,
        transferCode: data.targets[op.idx % data.targets.length],
        blankCode: null,
        scannedAt: new Date().toISOString(),
      };
      const res = http.post(`${BASE}/api/v1/production/scans`, JSON.stringify(body), {
        headers: headers({ authorization: `Bearer ${s.bearer}` }),
        jar: null,
        tags: { proc: "production.scan" },
      });
      record(scan, res);
      scan429Rate.add(res.status === 429);
    }
  }
}

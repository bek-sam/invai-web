// Floor scan storm: STATIONS tablets on the largest tenant, one scan per STATION_INTERVAL s each.
// Station logins happen once in setup() at <= 15/min (sleep 4 s), never during the run.
// 429 is counted apart; latency thresholds (p95 < 300 ms) apply to 2xx only (architect A3.9).

import { sleep } from "k6";
import http from "k6/http";
import { BASE, headers, loadCreds, metricsFor, record } from "./lib.k6.js";

const nStations = Number(__ENV.STATIONS || 20);
const interval = Number(__ENV.STATION_INTERVAL || 3);
const duration = __ENV.SCAN_DURATION || "10m";
const m = metricsFor("scan");

export const options = {
  setupTimeout: "10m",
  scenarios: {
    storm: {
      executor: "constant-arrival-rate",
      rate: nStations,
      timeUnit: `${interval}s`,
      duration,
      preAllocatedVUs: 30,
      maxVUs: 120,
    },
  },
  thresholds: {
    scan_latency_2xx: ["p(95)<300", "p(99)<600"],
    scan_non5xx: ["rate>0.995"],
  },
};

export function setup() {
  const creds = loadCreds();
  const pins = creds.floor.members.map((x) => x.pin);
  const sessions = [];
  const stations = creds.floor.stations.slice(0, nStations);
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const res = http.post(
      `${BASE}/api/v1/floor/login`,
      JSON.stringify({ pin: pins[i % pins.length] }),
      {
        headers: headers({ authorization: `Station ${st.token}` }),
        jar: null,
      },
    );
    if (res.status === 200) {
      const j = res.json();
      sessions.push({ bearer: j.sessionToken, kind: j.station.kind, stationId: j.station.id });
    } else {
      console.error(`station ${i} login ${res.status} ${String(res.body).slice(0, 120)}`);
    }
    sleep(4); // 15 logins/min against the 20/min auth bucket
  }
  if (sessions.length === 0) throw new Error("no station could log in");
  return { sessions, targets: creds.floor.scanTargets };
}

let seq = 0;

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

export default function (data) {
  const s = data.sessions[(__VU + __ITER) % data.sessions.length];
  const target = data.targets[(__VU * 7919 + __ITER + seq++) % data.targets.length];
  const body = {
    clientScanId: uuid(),
    station: s.kind || "press",
    stationId: s.stationId,
    transferCode: target,
    blankCode: null,
    scannedAt: new Date().toISOString(),
  };
  const res = http.post(`${BASE}/api/v1/production/scans`, JSON.stringify(body), {
    headers: headers({ authorization: `Bearer ${s.bearer}` }),
    jar: null,
    tags: { proc: "production.scan" },
  });
  record(m, res);
}

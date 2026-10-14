// Floor scan storm: STATIONS tablets on the largest tenant, one scan per STATION_INTERVAL s each.
// Station logins happen once in setup() at <= 15/min (sleep 4 s), never during the run.
// 429 is counted apart; latency thresholds (p95 < 300 ms) apply to 2xx only (architect A3.9).

import { sleep } from "k6";
import exec from "k6/execution";
import http from "k6/http";
import { Counter } from "k6/metrics";
import { BASE, creds, headers, metricsFor, record } from "./lib.k6.js";

const nStations = Number(__ENV.STATIONS || 20);
const interval = Number(__ENV.STATION_INTERVAL || 3);
const duration = __ENV.SCAN_DURATION || "10m";
const m = metricsFor("scan");
const accepted = new Counter("scan_accepted");
// T-56-5 A5.3: per-station admitted (any non-429 answer) and refused (429) counts, so a summary
// shows each station's min/max. FLOODERS stations scan at FLOOD_RATE per second instead of 1 per
// STATION_INTERVAL; the rest keep the normal rate (flood run: the per-station bucket must refuse
// only the flooders).
const flooders = Number(__ENV.FLOODERS || 0);
const floodRate = Number(__ENV.FLOOD_RATE || 5);
const admittedBy = [];
const limitedBy = [];
for (let i = 0; i < nStations; i++) {
  admittedBy.push(new Counter(`scan_st${String(i).padStart(2, "0")}_admitted`));
  limitedBy.push(new Counter(`scan_st${String(i).padStart(2, "0")}_429`));
}
const blocked = new Counter("scan_blocked");

export const options = {
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  setupTimeout: "10m",
  scenarios:
    flooders > 0
      ? {
          flood: {
            executor: "constant-arrival-rate",
            rate: flooders * floodRate,
            timeUnit: "1s",
            duration,
            preAllocatedVUs: 30,
            maxVUs: 120,
          },
          normal: {
            executor: "constant-arrival-rate",
            rate: nStations - flooders,
            timeUnit: `${interval}s`,
            duration,
            preAllocatedVUs: 30,
            maxVUs: 120,
          },
        }
      : {
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
  // SCAN_PATH=blocked scans the seeded transfer ids with no blank (a "blank_required" block);
  // the default pairs each transfer with its own blank from the press queue, so scans are accepted
  // (a state transition, scan row, audit and outbox write), the heavier path.
  const pairs = [];
  if (__ENV.SCAN_PATH === "blocked") {
    for (const t of creds.floor.scanTargets) pairs.push({ transferCode: t, blankCode: null });
  } else {
    let cursor = null;
    while (pairs.length < Number(__ENV.PAIRS || 4000)) {
      const q = `station=press&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = http.get(`${BASE}/api/v1/production/queue?${q}`, {
        headers: headers({ authorization: `Bearer ${sessions[0].bearer}` }),
        jar: null,
      });
      if (res.status !== 200) throw new Error(`press queue ${res.status}`);
      for (const it of res.json("items")) {
        if (it.transferId && it.blank)
          pairs.push({ transferCode: it.transferId, blankCode: it.blank.variantId });
      }
      cursor = res.json("nextCursor");
      if (!cursor) break;
    }
  }
  if (pairs.length === 0) throw new Error("no scan targets");
  return { sessions, pairs };
}

// The flood run's "normal" scenario starts half-way into the pool so the two never share a transfer.
const normalOffset = 2000;

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
  // Even spread: the scenario's own iteration counter picks the station (A5.3). Flood run: the
  // first FLOODERS stations belong to the "flood" scenario, the others to "normal".
  const n = exec.scenario.iterationInTest;
  const idx =
    flooders > 0
      ? exec.scenario.name === "flood"
        ? n % flooders
        : flooders + (n % (data.sessions.length - flooders))
      : n % data.sessions.length;
  const s = data.sessions[idx];
  const target =
    data.pairs[
      (exec.scenario.iterationInTest + (exec.scenario.name === "normal" ? normalOffset : 0)) %
        data.pairs.length
    ];
  const body = {
    clientScanId: uuid(),
    station: "press",
    stationId: s.stationId,
    transferCode: target.transferCode,
    blankCode: target.blankCode,
    scannedAt: new Date().toISOString(),
  };
  const res = http.post(`${BASE}/api/v1/production/scans`, JSON.stringify(body), {
    headers: headers({ authorization: `Bearer ${s.bearer}` }),
    jar: null,
    tags: { proc: "production.scan" },
  });
  record(m, res);
  if (idx < nStations) (res.status === 429 ? limitedBy : admittedBy)[idx].add(1);
  if (res.status === 200) (res.json("ok") ? accepted : blocked).add(1);
}

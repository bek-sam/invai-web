// Floor queue-reload model (T-57-3). Pure functions, no k6 imports: the k6 script and the node
// unit check (reload-model.check.mjs) both load this file.
//
// What the tablet does (invai-floor/src/hooks/useStationQueue.ts):
//  - base 0997119, "debounce": every realtime invalidation (and the tablet's own scan, same timer)
//    clears the timer and sets it again to +400 ms, so a queue loads only after 400 ms of quiet.
//  - d178c93, "throttle" (T-57-4): the first invalidation after a quiet spell loads at +400 ms; then
//    at most one realtime-driven load per 10 s; an invalidation inside the window loads at
//    lastLoad + 10 s; an invalidation while a load is already scheduled rides on it.
// Fan-out: one scan publishes item.state_changed, order.updated and queue.changed on the company
// channel, so every tablet of the shop receives it (backend state-machine.ts:125-134, floor.ts:269-275,
// realtime.ts:32,85) and invalidates on all six names (floor useRealtime.ts:9-16,35). All tablets
// therefore see the same event times, and one scan is one burst inside one window.

export const QUIET_MS = 400;
export const WINDOW_MS = 10_000;

/** mulberry32: small seeded PRNG so phase 1 and phase 2 draw the same schedule. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Poisson scan arrivals: exponential gaps at `ratePerSec` for `durationSec`, each scan on a
 * uniformly drawn tablet. Returns [{ t (ms from start), tablet }], sorted by t.
 */
export function poissonScans(seed, ratePerSec, durationSec, tablets) {
  const r = rng(seed);
  const out = [];
  let t = 0;
  for (;;) {
    t += (-Math.log(1 - r()) / ratePerSec) * 1000;
    if (t >= durationSec * 1000) break;
    out.push({ t: Math.round(t), tablet: Math.floor(r() * tablets) });
  }
  return out;
}

/** Today (base 0997119): trailing debounce, reset by every event. Returns the load times (ms). */
export function debounceLoads(events, delayMs = QUIET_MS) {
  const ev = [...events].sort((a, b) => a - b);
  const loads = [];
  for (let i = 0; i < ev.length; i++) {
    const next = i + 1 < ev.length ? ev[i + 1] : Number.POSITIVE_INFINITY;
    if (next - ev[i] >= delayMs) loads.push(ev[i] + delayMs);
  }
  return loads;
}

/** After (d178c93): first load +quietMs, then at most one per windowMs, with a trailing load. */
export function throttleLoads(events, opts = {}) {
  const quiet = opts.quietMs ?? QUIET_MS;
  const win = opts.windowMs ?? WINDOW_MS;
  const ev = [...events].sort((a, b) => a - b);
  const loads = [];
  let last = null;
  let timerAt = null;
  const fire = (upTo) => {
    if (timerAt !== null && timerAt <= upTo) {
      loads.push(timerAt);
      last = timerAt;
      timerAt = null;
    }
  };
  for (const e of ev) {
    fire(e);
    if (timerAt !== null) continue; // rides on the scheduled load
    const delay = last === null || e - last >= win ? quiet : Math.max(0, last + win - e);
    timerAt = e + delay;
  }
  fire(Number.POSITIVE_INFINITY);
  return loads;
}

/** Per-tablet operation plan: its own scans (POST) and the model's queue loads (GET), by time. */
export function tabletPlans(scans, tablets, model) {
  const times = scans.map((s) => s.t);
  const loads = model === "throttle" ? throttleLoads(times) : debounceLoads(times);
  const plans = [];
  for (let i = 0; i < tablets; i++) {
    const ops = loads.map((t) => ({ t, k: "load" }));
    scans.forEach((s, idx) => {
      if (s.tablet === i) ops.push({ t: s.t, k: "scan", idx });
    });
    ops.sort((a, b) => a.t - b.t || (a.k === "scan" ? -1 : 1));
    plans.push(ops);
  }
  return { loads, plans };
}

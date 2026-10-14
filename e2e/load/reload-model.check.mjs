// Unit checks for reload-model.js (T-57-3 AC1). Run: node e2e/load/reload-model.check.mjs
import assert from "node:assert/strict";
import { debounceLoads, poissonScans, tabletPlans, throttleLoads } from "./reload-model.js";

// AC1: a burst of N events inside 400 ms costs one read per station (both models).
for (const n of [1, 3, 5, 40]) {
  const burst = Array.from({ length: n }, (_, i) => 1000 + Math.floor((i * 399) / Math.max(1, n)));
  assert.deepEqual(debounceLoads(burst), [burst[n - 1] + 400], `debounce burst ${n}`);
  assert.deepEqual(throttleLoads(burst), [burst[0] + 400], `throttle burst ${n}`);
}
// Debounce: the timer resets on every event, so events 150 ms apart never fire until they stop.
const steady = Array.from({ length: 400 }, (_, i) => i * 150); // 60 s
assert.deepEqual(debounceLoads(steady), [399 * 150 + 400], "debounce starves under steady events");
// Throttle: the same stream loads about every 10 s and never 0 times.
const tl = throttleLoads(steady);
assert.equal(tl[0], 400);
assert.ok(tl.length >= 6 && tl.length <= 7, `throttle 60 s steady: ${tl.length} loads`);
for (let i = 1; i < tl.length; i++) assert.ok(tl[i] - tl[i - 1] >= 10_000 - 1, "gap >= window");
// Throttle: an event inside the window loads at lastLoad + 10 s (trailing, never starved).
assert.deepEqual(throttleLoads([0, 5000]), [400, 10_400]);
// An event after a quiet spell (>= 10 s since the last load) loads at +400 ms again.
assert.deepEqual(throttleLoads([0, 20_000]), [400, 20_400]);
// Two separate bursts under debounce cost two loads.
assert.deepEqual(debounceLoads([0, 100, 5000, 5100]), [500, 5500]);
// Same seed, same schedule; the model is deterministic.
const a = poissonScans(57, 400 / 60, 600, 20);
const b = poissonScans(57, 400 / 60, 600, 20);
assert.deepEqual(a, b);
assert.ok(a.length > 3800 && a.length < 4200, `scans ${a.length}`);
// Plans: every tablet carries every load, scans only its own.
const { loads, plans } = tabletPlans(a, 20, "debounce");
assert.equal(plans.length, 20);
assert.ok(plans.every((p) => p.filter((o) => o.k === "load").length === loads.length));
assert.equal(
  plans.reduce((s, p) => s + p.filter((o) => o.k === "scan").length, 0),
  a.length,
);
// Estimate vs the architect's closed form: lambda * exp(-lambda * 0.4) loads per second.
const lam = 400 / 60;
const perMin = lam * Math.exp(-lam * 0.4) * 60;
const got = (debounceLoads(a.map((s) => s.t)).length / 600) * 60;
assert.ok(Math.abs(got - perMin) / perMin < 0.15, `debounce ${got}/min vs ${perMin}/min`);
console.log(
  `ok: debounce ${got.toFixed(1)}/min/tablet (closed form ${perMin.toFixed(1)}), ` +
    `throttle ${((throttleLoads(a.map((s) => s.t)).length / 600) * 60).toFixed(1)}/min/tablet`,
);

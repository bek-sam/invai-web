import { describe, expect, it, vi } from "vitest";
import { isTransientError, pollJob } from "./poll-job";

type J = { status: "queued" | "running" | "done" | "failed"; n?: number };

/** A fake clock: `sleep` advances time instantly and records each wait. */
function clock() {
  let t = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => t,
    sleep: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
  };
}

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe("pollJob", () => {
  it("polls until the job finishes, done or failed", async () => {
    const c = clock();
    const seq: J[] = [{ status: "queued" }, { status: "running" }, { status: "done", n: 3 }];
    const fetchJob = vi.fn(async () => seq.shift() as J);
    const out = await pollJob(fetchJob, { now: c.now, sleep: c.sleep, intervalMs: 1_000 });
    expect(out).toEqual({ kind: "finished", job: { status: "done", n: 3 } });
    expect(fetchJob).toHaveBeenCalledTimes(3);
    expect(c.waits).toEqual([1_000, 1_000]);

    const failed = await pollJob(async () => ({ status: "failed" }) as J, c);
    expect(failed).toEqual({ kind: "finished", job: { status: "failed" } });
  });

  it("gives up at the deadline with the last job seen", async () => {
    const c = clock();
    const fetchJob = vi.fn(async () => ({ status: "running" }) as J);
    const out = await pollJob(fetchJob, {
      now: c.now,
      sleep: c.sleep,
      intervalMs: 1_500,
      deadlineMs: 180_000,
    });
    expect(out).toEqual({ kind: "timeout", job: { status: "running" } });
    expect(c.now()).toBe(180_000); // never waits past the deadline
    expect(fetchJob).toHaveBeenCalledTimes(121);
  });

  it("retries transient errors (429, 503, network) with backoff, then carries on", async () => {
    const c = clock();
    const fetchJob = vi
      .fn<() => Promise<J>>()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({ status: "done" });
    const out = await pollJob(fetchJob, { now: c.now, sleep: c.sleep, intervalMs: 1_000 });
    expect(out.kind).toBe("finished");
    expect(c.waits).toEqual([2_000, 4_000, 8_000, 1_000]); // backoff, then back to the interval
  });

  it("keeps retrying a down server only until the deadline, as a timeout, not an error", async () => {
    const c = clock();
    const out = await pollJob(
      async () => {
        throw httpError(503);
      },
      { now: c.now, sleep: c.sleep, intervalMs: 1_000, deadlineMs: 60_000, maxBackoffMs: 10_000 },
    );
    expect(out).toEqual({ kind: "timeout", job: null });
    expect(Math.max(...c.waits)).toBe(10_000);
  });

  it("throws a real error (403, 404) at once", async () => {
    const c = clock();
    await expect(
      pollJob(
        async () => {
          throw httpError(404);
        },
        { now: c.now, sleep: c.sleep },
      ),
    ).rejects.toThrow("HTTP 404");
    expect(c.waits).toEqual([]);
  });

  it("stops when aborted, before or during a wait", async () => {
    const before = new AbortController();
    before.abort();
    const fetchJob = vi.fn(async () => ({ status: "running" }) as J);
    expect(await pollJob(fetchJob, { signal: before.signal })).toEqual({ kind: "aborted" });
    expect(fetchJob).not.toHaveBeenCalled();

    // Real timers: the abort wakes the pending sleep, so nothing waits for the interval.
    const during = new AbortController();
    const started = Date.now();
    const pending = pollJob(fetchJob, { signal: during.signal, intervalMs: 60_000 });
    setTimeout(() => during.abort(), 20);
    expect(await pending).toEqual({ kind: "aborted" });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it("treats an error that arrives after the abort as aborted", async () => {
    const ac = new AbortController();
    const out = await pollJob(
      async () => {
        ac.abort();
        throw httpError(500);
      },
      { signal: ac.signal },
    );
    expect(out).toEqual({ kind: "aborted" });
  });
});

describe("isTransientError", () => {
  it("retries only busy or unreachable", () => {
    for (const s of [408, 429, 502, 503, 504]) expect(isTransientError(httpError(s))).toBe(true);
    for (const s of [400, 401, 403, 404, 409, 422, 500])
      expect(isTransientError(httpError(s))).toBe(false);
    expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
  });
});

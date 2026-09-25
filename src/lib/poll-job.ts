import { errorInfo } from "./errors";

/** The part of a contracts `Job` the poll needs. */
type JobLike = { status: "queued" | "running" | "done" | "failed" };

export type PollOutcome<J> =
  /** The job reached `done` or `failed`; the caller decides what a failed job means. */
  | { kind: "finished"; job: J }
  /** Still not finished at the deadline (worker down, long backlog): the work may still land. */
  | { kind: "timeout"; job: J | null }
  /** The caller stopped caring (the page unmounted). */
  | { kind: "aborted" };

export type PollOptions = {
  signal?: AbortSignal;
  /** Wait between polls (ms). */
  intervalMs?: number;
  /** Give up waiting after this long (ms), from the first call. */
  deadlineMs?: number;
  /** Longest wait between polls while the server is failing (ms). */
  maxBackoffMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

/** Server busy or unreachable: worth asking again. Anything else (403, 404, 422…) is real. */
export function isTransientError(err: unknown): boolean {
  const { code, status } = errorInfo(err);
  if (code === "NETWORK") return true;
  if (status === null) return err instanceof TypeError;
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function abortableSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Poll a background job until it finishes, the deadline passes or the signal aborts.
 * Transient errors (network, 408/429/502/503/504) are retried with exponential backoff until
 * the deadline, so a busy or restarting API never turns into an error for work that was
 * accepted. Any other error is thrown.
 */
export async function pollJob<J extends JobLike>(
  fetchJob: () => Promise<J>,
  opts: PollOptions = {},
): Promise<PollOutcome<J>> {
  const {
    signal,
    intervalMs = 1_500,
    deadlineMs = 180_000,
    maxBackoffMs = 15_000,
    now = Date.now,
    sleep = abortableSleep,
  } = opts;
  const until = now() + deadlineMs;
  let last: J | null = null;
  let failures = 0;
  for (;;) {
    if (signal?.aborted) return { kind: "aborted" };
    let wait = intervalMs;
    try {
      last = await fetchJob();
      failures = 0;
      if (last.status === "done" || last.status === "failed")
        return { kind: "finished", job: last };
    } catch (err) {
      if (signal?.aborted) return { kind: "aborted" };
      if (!isTransientError(err)) throw err;
      failures += 1;
      wait = Math.min(maxBackoffMs, intervalMs * 2 ** failures);
    }
    const left = until - now();
    if (left <= 0) return { kind: "timeout", job: last };
    await sleep(Math.min(wait, left), signal);
  }
}

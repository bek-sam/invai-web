import type { Job } from "@invai/contracts";

export type ExportView = "none" | "running" | "ready" | "failed" | "expired";

/** Which state the "Download all your data" section shows for the last known export job. */
export function exportView(
  job: Pick<Job, "status" | "resultIds" | "message"> | undefined,
): ExportView {
  if (!job) return "none";
  if (job.status === "queued" || job.status === "running") return "running";
  if (job.status === "failed") return "failed";
  // Decision 0033: after 7 days the status stays "done" but resultIds is empty.
  if (job.resultIds.length === 0 || job.message === "expired") return "expired";
  return "ready";
}

/** Poll every 3 s while the job is queued or running; stop otherwise (and when polling fails). */
export function exportRefetchInterval(
  job: Pick<Job, "status"> | undefined,
  failed: boolean,
): number | false {
  if (failed || !job) return false;
  return job.status === "queued" || job.status === "running" ? 3000 : false;
}

/** Storage key of the last export job id; one per company. */
export function exportStorageKey(companyId: string): string {
  return `invai:export:${companyId}`;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoredExportId(companyId: string, store: Store | null = browserStore()) {
  try {
    return store?.getItem(exportStorageKey(companyId)) || null;
  } catch {
    return null;
  }
}

export function writeStoredExportId(
  companyId: string,
  jobId: string | null,
  store: Store | null = browserStore(),
) {
  try {
    if (!store) return;
    if (jobId) store.setItem(exportStorageKey(companyId), jobId);
    else store.removeItem(exportStorageKey(companyId));
  } catch {
    // Storage blocked (private window): the section still works for this visit.
  }
}

/** The file key of a finished export (contract: privacy.ts). */
export function exportFileKey(companyId: string, fileId: string): string {
  return `${companyId}/tenant-export/${fileId}.zip`;
}

/** The running job's id from a 409 EXPORT_IN_PROGRESS error, or null for any other error. */
export function inProgressJobId(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: unknown; data?: unknown };
  if (e.code !== "EXPORT_IN_PROGRESS") return null;
  const id = (e.data as { jobId?: unknown } | null | undefined)?.jobId;
  return typeof id === "string" && id ? id : null;
}

import { Progress } from "@invai/ui";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useJob } from "../../hooks/use-job";
import { formatPct } from "../../lib/format";

/** Live progress for a worker job; calls onDone once when it finishes. */
export function JobProgress({
  jobId,
  label,
  onDone,
}: {
  jobId: string;
  label: string;
  onDone?: (resultIds: string[], ok: boolean) => void;
}) {
  const { t } = useTranslation();
  const job = useJob(jobId);
  const fired = useRef(false);
  const status = job.data?.status ?? "queued";
  useEffect(() => {
    if (fired.current || !job.data) return;
    if (job.data.status === "done" || job.data.status === "failed") {
      fired.current = true;
      onDone?.(job.data.resultIds, job.data.status === "done");
    }
  }, [job.data, onDone]);
  return (
    <div className="rounded-md border border-border p-3" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        {status === "done" ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : status === "failed" ? (
          <XCircle className="size-4 text-danger" />
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <span className="font-medium">{label}</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {job.isError ? t("jobs.unknown", "status unknown") : formatPct(job.data?.progress ?? 0)}
        </span>
      </div>
      <Progress value={(job.data?.progress ?? 0) * 100} className="mt-2" />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {job.data?.error ?? job.data?.message ?? t(`jobs.status.${status}`, status)}
      </p>
    </div>
  );
}

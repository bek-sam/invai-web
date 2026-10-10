import { Button, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "../../components/page";
import { ErrorState } from "../../components/states";
import { errorInfo, errorMessage, shouldRetry } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { useCan, useMe } from "../../lib/me";
import { client, orpc } from "../../lib/rpc";
import {
  type ExportView,
  exportFileKey,
  exportRefetchInterval,
  exportView,
  inProgressJobId,
  readStoredExportId,
  writeStoredExportId,
} from "./state";

/** Owner-only "Download all your data" section (B-339). Renders nothing without `org.export`. */
export function CompanyExport() {
  const can = useCan();
  if (!can("org.export")) return null;
  return <CompanyExportInner />;
}

function CompanyExportInner() {
  const { t } = useTranslation();
  const me = useMe();
  const companyId = me.org.id;
  const queryClient = useQueryClient();
  const [jobId, setJobIdState] = useState<string | null>(() => readStoredExportId(companyId));
  const [expiredIds, setExpiredIds] = useState<string[]>([]);
  const setJobId = (id: string | null) => {
    setJobIdState(id);
    writeStoredExportId(companyId, id);
  };

  const status = useQuery({
    ...orpc.privacy.exportStatus.queryOptions({ input: { jobId: jobId ?? "" } }),
    enabled: jobId !== null,
    retry: (n, err) => shouldRetry(n, err),
    refetchInterval: (q) => exportRefetchInterval(q.state.data, q.state.status === "error"),
  });
  const notFound = status.isError && errorInfo(status.error).code === "NOT_FOUND";
  if (notFound && jobId) setJobId(null);

  const start = useMutation(
    orpc.privacy.exportTrigger.mutationOptions({
      onSuccess: (job) => {
        setJobId(job.id);
        void queryClient.invalidateQueries({ queryKey: orpc.privacy.key() });
      },
      onError: (err) => {
        const running = inProgressJobId(err);
        if (running) setJobId(running);
        else toast.error(errorMessage(err));
      },
    }),
  );

  const [downloading, setDownloading] = useState(false);
  const job = jobId ? status.data : undefined;
  let view: ExportView = exportView(job);
  if (view === "ready" && jobId && expiredIds.includes(jobId)) view = "expired";

  async function download() {
    const fileId = job?.resultIds[0];
    if (!fileId || !jobId) return;
    setDownloading(true);
    try {
      const { url } = await client.files.downloadUrl({
        fileKey: exportFileKey(companyId, fileId),
        disposition: "attachment",
      });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      if (errorInfo(err).code === "NOT_FOUND") setExpiredIds((ids) => [...ids, jobId]);
      else toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  const startButton = (
    <Button
      variant="outline"
      onClick={() => start.mutate({})}
      disabled={start.isPending}
      data-testid="company-export-start"
    >
      {start.isPending && <Loader2 className="animate-spin" />}
      {t("companyExport.start", "Prepare my data")}
    </Button>
  );

  return (
    <div data-testid="company-export">
      <Section
        title={t("companyExport.title", "Download all your data")}
        description={t(
          "companyExport.body",
          "Get a zip file with all your shop's records and uploaded files. It includes buyer details, so keep it safe. The download link works for 7 days.",
        )}
      >
        {jobId && status.isPending ? (
          <div className="h-9 w-48 animate-pulse rounded-md bg-muted" aria-hidden />
        ) : status.isError && !notFound ? (
          <ErrorState error={status.error} compact onRetry={() => void status.refetch()} />
        ) : view === "running" ? (
          <div className="flex flex-col gap-2" role="status">
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("companyExport.running", "Preparing your export. This can take a few minutes.")}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((job?.progress ?? 0) * 100)}
              className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        ) : view === "ready" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {t("companyExport.ready", "Your export is ready.")}{" "}
              <span className="text-muted-foreground">{formatDateTime(job?.finishedAt)}</span>
            </p>
            <Button
              onClick={() => void download()}
              disabled={downloading}
              data-testid="company-export-download"
            >
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
              {t("companyExport.download", "Download")}
            </Button>
            {startButton}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            {view === "failed" && (
              <p className="text-sm text-danger" role="alert">
                {t("companyExport.failed", "The export didn't finish. Try again.")}
              </p>
            )}
            {view === "expired" && (
              <p className="text-sm">
                {t(
                  "companyExport.expired",
                  "This download expired after 7 days. Start a new export to get your data again.",
                )}
              </p>
            )}
            {startButton}
          </div>
        )}
      </Section>
    </div>
  );
}

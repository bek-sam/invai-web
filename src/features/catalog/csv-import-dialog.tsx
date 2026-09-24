import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileDrop,
  Progress,
} from "@invai/ui";
import { FileText, Loader2 } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "../../components/states";
import { uploadFile } from "../../lib/upload";

/**
 * Upload a CSV via a presigned URL, then hand the file key to `onImport`, which runs the
 * import procedure and returns a report to render.
 */
export function CsvImportDialog<R>({
  open,
  onOpenChange,
  title,
  description,
  extra,
  onImport,
  renderReport,
  canSubmit = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  onImport: (fileKey: string) => Promise<R>;
  renderReport: (report: R) => React.ReactNode;
  canSubmit?: boolean;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [report, setReport] = useState<R | null>(null);
  const [running, setRunning] = useState(false);

  const reset = () => {
    setFile(null);
    setProgress(null);
    setError(null);
    setReport(null);
    setRunning(false);
  };

  async function run() {
    if (!file) return;
    setRunning(true);
    setError(null);
    try {
      const key = await uploadFile("csv", file, setProgress);
      setReport(await onImport(key));
    } catch (e) {
      setError(e);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {report ? (
          renderReport(report)
        ) : (
          <div className="flex flex-col gap-4">
            {extra}
            <FileDrop
              accept=".csv,text/csv"
              onFiles={(f) => setFile(f[0] ?? null)}
              disabled={running}
              label={t("csv.drop", "Drop a CSV file, or click to browse")}
              hint={t("csv.hint", "Up to 5,000 rows")}
            />
            {file && (
              <p className="flex items-center gap-2 text-sm">
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
                <span className="text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
              </p>
            )}
            {progress !== null && running && <Progress value={progress * 100} className="h-1.5" />}
            {error !== null && <ErrorState error={error} compact />}
          </div>
        )}
        <DialogFooter>
          {report ? (
            <>
              <Button variant="outline" onClick={reset}>
                {t("csv.another", "Import another")}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{t("action.close")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("action.cancel")}
              </Button>
              <Button onClick={() => void run()} disabled={!file || running || !canSubmit}>
                {running && <Loader2 className="animate-spin" />}
                {t("csv.import", "Import")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReportStats({
  stats,
}: {
  stats: [string, number, "ok" | "warn" | "bad" | "neutral"][];
}) {
  const tone = {
    ok: "text-success",
    warn: "text-warning",
    bad: "text-danger",
    neutral: "",
  } as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(([label, n, k]) => (
        <div key={label} className="rounded-md border border-border p-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-xl font-semibold tabular-nums ${n > 0 ? tone[k] : ""}`}>
            {n.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

export function RowErrors({ errors }: { errors: { row: number; message: string }[] }) {
  const { t } = useTranslation();
  if (errors.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium">{t("csv.rowErrors", "Rows with errors")}</p>
      <ul className="max-h-40 overflow-y-auto rounded-md border border-border text-xs">
        {errors.slice(0, 200).map((e) => (
          <li
            key={`${e.row}-${e.message}`}
            className="flex gap-2 border-b border-border px-2 py-1 last:border-0"
          >
            <span className="w-12 shrink-0 text-muted-foreground">#{e.row}</span>
            <span className="text-danger">{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { AnalyticsExportInput } from "@invai/contracts";
import { toast } from "@invai/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../lib/errors";
import { client } from "../../../lib/rpc";

/**
 * AC1 / AC-E6: every Profit v2 view's Export CSV, same pattern as the existing Profit page's
 * export (presign a key, then open the download URL). The file always carries exactly the input
 * the screen is showing, since `AnalyticsExportInput` is a discriminated union on `view`.
 */
export function useExportAnalyticsCsv() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  async function run(input: AnalyticsExportInput) {
    setExporting(true);
    try {
      const { key } = await client.analytics.export(input);
      const { url } = await client.files.downloadUrl({ fileKey: key, disposition: "attachment" });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }
  return { exporting, run, label: t("profit.export", "Export CSV") };
}

import { useTranslation } from "react-i18next";

type SheetFilesInfo = { status: string; files: { pngKey?: string | null; pdfKey?: string | null } };

const PURGED_STATUSES = ["printed", "shipped", "received"];

function filesGone(sheet: SheetFilesInfo): boolean {
  return !sheet.files.pngKey && !sheet.files.pdfKey;
}

/** Print files were purged for buyer-data protection (decision 0032). Only `ready` writes keys, so these statuses always had them. */
export function printFilesRemoved(sheet: SheetFilesInfo): boolean {
  return filesGone(sheet) && PURGED_STATUSES.includes(sheet.status);
}

/** A cancelled sheet with no files; whether it ever had files is not knowable from the sheet. */
export function cancelledWithoutFiles(sheet: SheetFilesInfo): boolean {
  return filesGone(sheet) && sheet.status === "cancelled";
}

/** Explains why the PNG/PDF buttons are disabled; renders nothing when no explanation applies. */
export function PrintFilesNote({
  sheet,
  audience,
}: {
  sheet: SheetFilesInfo;
  audience: "shop" | "vendor";
}) {
  const { t } = useTranslation();
  const shop = audience === "shop";
  let text: string | null = null;
  if (printFilesRemoved(sheet)) {
    text = shop
      ? t(
          "sheets.filesRemoved",
          "Print files were removed to protect buyer data. To print these designs again, build a new sheet.",
        )
      : t("sheets.filesRemovedVendor", "Print files were removed to protect buyer data.");
  } else if (cancelledWithoutFiles(sheet)) {
    text = shop
      ? t(
          "sheets.cancelledNoFiles",
          "This sheet was cancelled, so it has no print files. To print these designs, build a new sheet.",
        )
      : t("sheets.cancelledNoFilesVendor", "This sheet was cancelled, so it has no print files.");
  }
  if (!text) return null;
  return <p className="basis-full text-sm text-muted-foreground">{text}</p>;
}

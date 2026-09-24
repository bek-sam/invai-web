import type { SheetPlacement } from "@invai/contracts";
import { cn, Skeleton } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ZoomImage } from "../../components/zoom-image";
import { orpc } from "../../lib/rpc";

/** Zoomable sheet preview with placement boxes; `source` picks the shop or vendor download endpoint. */
export function SheetPreview({
  sheetId,
  widthIn,
  lengthIn,
  placements,
  highlight,
  source,
}: {
  sheetId: string;
  widthIn: number;
  lengthIn: number;
  placements: SheetPlacement[];
  highlight: string | null;
  source: "shop" | "vendor";
}) {
  const { t } = useTranslation();
  const shop = useQuery(
    orpc.production.sheets.downloadUrls.queryOptions({
      input: { id: sheetId },
      enabled: source === "shop",
      staleTime: 10 * 60_000,
    }),
  );
  const vendor = useQuery(
    orpc.vendorPortal.downloadUrls.queryOptions({
      input: { id: sheetId },
      enabled: source === "vendor",
      staleTime: 10 * 60_000,
    }),
  );
  const q = source === "shop" ? shop : vendor;
  if (q.isPending) return <Skeleton className="h-[60vh] w-full" />;
  const url = q.data?.preview ?? q.data?.png ?? null;
  if (!url) {
    return (
      <div className="flex h-[40vh] flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted text-sm text-muted-foreground">
        <ImageOff className="size-6" />
        {q.isError
          ? t("sheets.previewError", "Couldn't load the preview")
          : t("sheets.noPreview", "No preview yet")}
      </div>
    );
  }
  return (
    <ZoomImage
      src={url}
      alt={t("sheets.previewAlt", "Gang sheet preview")}
      className="h-[70vh] bg-muted"
      overlay={
        lengthIn > 0 &&
        placements.map((p) => (
          <div
            key={p.transferId}
            className={cn(
              "absolute border transition-colors",
              highlight === p.transferId
                ? "border-2 border-primary bg-primary/20"
                : "border-transparent",
              p.scrapped && "border-danger bg-danger/20",
            )}
            style={{
              left: `${(p.xIn / widthIn) * 100}%`,
              top: `${(p.yIn / lengthIn) * 100}%`,
              width: `${(p.widthIn / widthIn) * 100}%`,
              height: `${(p.heightIn / lengthIn) * 100}%`,
            }}
          />
        ))
      }
    />
  );
}

import type { SheetPlacement } from "@invai/contracts";
import { Badge } from "@invai/ui";
import { useTranslation } from "react-i18next";
import { Section } from "../../components/page";
import { formatInches, orderLabel } from "../../lib/format";

export function PlacementList({
  placements,
  onHover,
}: {
  placements: SheetPlacement[];
  onHover: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <Section title={t("sheets.placements", "Placements ({{count}})", { count: placements.length })}>
      <div className="-mx-4 -my-4 max-h-[50vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/95 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{t("orders.order", "Order")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("orders.design", "Design")}</th>
              <th className="px-2 py-2 text-left font-medium">
                {t("sheets.blank", "Size / color")}
              </th>
              <th className="px-4 py-2 text-right font-medium">{t("sheets.dims", "W × H")}</th>
            </tr>
          </thead>
          <tbody>
            {placements.map((p) => (
              <tr
                key={p.transferId}
                onMouseEnter={() => onHover(p.transferId)}
                onMouseLeave={() => onHover(null)}
                className={p.scrapped ? "text-muted-foreground line-through" : "hover:bg-muted/50"}
              >
                <td className="border-t border-border px-4 py-1.5 font-medium">
                  {orderLabel(p.orderNo)}
                  {p.isReprint && (
                    <Badge variant="warning" className="ml-1.5 px-1.5">
                      {t("orders.reprint", "Reprint")}
                    </Badge>
                  )}
                </td>
                <td className="border-t border-border px-2 py-1.5">{p.designName}</td>
                <td className="border-t border-border px-2 py-1.5">
                  {p.size} · {p.color}
                </td>
                <td className="border-t border-border px-4 py-1.5 text-right tabular-nums">
                  {formatInches(p.widthIn)} × {formatInches(p.heightIn)}
                  {p.rotated && " ↻"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

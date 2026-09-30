import type { SupplierTrends } from "@invai/contracts";
import { Button, Money } from "@invai/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Section } from "../../components/page";
import { KpiTile, MiniTable } from "./shared";

/** AC-C5: unit cost by supplier x style x month, median lead days vs. the lead-time setting. */
export function SupplierTrendsView({ data }: { data: SupplierTrends }) {
  const { t } = useTranslation();
  return (
    <Section
      title={t("invV2.supplierTrends", "Supplier trends")}
      description={t(
        "invV2.supplierTrendsHint",
        "Unit cost by month and how long orders actually take to arrive.",
      )}
      actions={
        data.suggestUpdateLeadTime && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/inventory">{t("invV2.updateLeadTime", "Update lead time")}</Link>
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile
            label={t("invV2.leadTimeSetting", "Lead time setting")}
            value={t("invV2.days", "{{n}} days", { n: data.leadTimeSettingDays })}
          />
          <KpiTile
            label={t("invV2.measuredLeadTime", "Measured lead time")}
            value={
              data.measuredLeadDays === null
                ? t("invV2.notEnoughPos", "Not enough POs yet")
                : t("invV2.days", "{{n}} days", { n: data.measuredLeadDays })
            }
          />
        </div>
        <MiniTable
          caption={t("invV2.supplierTrends", "Supplier trends")}
          rows={data.rows}
          rowKey={(row, i) => `${row.supplier}-${row.styleCode}-${row.month}-${i}`}
          columns={[
            { key: "month", header: t("invV2.month", "Month"), cell: (row) => row.month },
            {
              key: "supplier",
              header: t("invV2.supplier", "Supplier"),
              cell: (row) => row.supplierName,
            },
            { key: "style", header: t("invV2.style", "Style"), cell: (row) => row.styleCode },
            {
              key: "pos",
              header: t("invV2.purchaseOrders", "POs"),
              cell: (row) => row.purchaseOrders,
              align: "right",
            },
            {
              key: "units",
              header: t("invV2.units", "Units"),
              cell: (row) => row.units,
              align: "right",
            },
            {
              key: "avgUnitCost",
              header: t("invV2.avgUnitCost", "Avg. unit cost"),
              cell: (row) => <Money cents={row.avgUnitCost} />,
              align: "right",
            },
            {
              key: "leadDays",
              header: t("invV2.medianLeadDays", "Median lead days"),
              cell: (row) => (row.medianLeadDays === null ? "—" : row.medianLeadDays.toFixed(0)),
              align: "right",
            },
          ]}
        />
      </div>
    </Section>
  );
}

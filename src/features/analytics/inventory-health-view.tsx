import type { InventoryHealth, SizeMixGapGroup } from "@invai/contracts";
import { Money } from "@invai/ui";
import { useTranslation } from "react-i18next";
import { Section } from "../../components/page";
import { formatDate, formatNumber, formatPctNumberLocale } from "../../lib/format";
import { formatPoints, KpiTile, MiniTable, NotEnoughHistoryBanner } from "./shared";

/** AC-C1/C2/screen1: on-hand value and turns, dead stock, size-mix gaps and stockout exposure. */
export function InventoryHealthView({ data }: { data: InventoryHealth }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <NotEnoughHistoryBanner hasEnoughHistory={data.hasEnoughHistory} />
      <Section title={t("invV2.onHand", "On-hand stock")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label={t("invV2.onHandUnits", "On-hand units")}
            value={formatNumber(data.onHandUnits)}
          />
          <KpiTile
            label={t("invV2.onHandValue", "On-hand value")}
            value={<Money cents={data.onHandValue} />}
          />
          <KpiTile
            label={t("invV2.consumedCost", "Blank cost used")}
            value={<Money cents={data.consumedCost} />}
          />
          <KpiTile
            label={t("invV2.turns", "Turns / yr")}
            value={data.turns === null ? "—" : data.turns.toFixed(1)}
          />
        </div>
      </Section>
      <DeadStockSection data={data} />
      <SizeMixSection groups={data.sizeMixGaps} />
      <StockoutSection data={data} />
    </div>
  );
}

function DeadStockSection({ data }: { data: InventoryHealth }) {
  const { t } = useTranslation();
  const d = data.deadStock;
  return (
    <Section
      title={t("invV2.deadStock", "Dead stock")}
      description={t("invV2.deadStockHint", "Variants with stock and no use in 90 days.")}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile label={t("invV2.deadVariants", "Dead variants")} value={d.variants} />
          <KpiTile
            label={t("invV2.deadValue", "Dead stock value")}
            value={<Money cents={d.value} />}
          />
          <KpiTile
            label={t("invV2.deadPctOfStock", "% of stock value")}
            value={d.pctOfStockValue === null ? "—" : formatPctNumberLocale(d.pctOfStockValue)}
          />
        </div>
        <MiniTable
          caption={t("invV2.deadStock", "Dead stock")}
          rows={d.rows}
          rowKey={(row) => row.blankVariantId}
          columns={[
            { key: "label", header: t("invV2.variant", "Variant"), cell: (row) => row.label },
            {
              key: "onHand",
              header: t("invV2.onHandUnits", "On-hand units"),
              cell: (row) => row.onHand,
              align: "right",
            },
            {
              key: "value",
              header: t("invV2.value", "Value"),
              cell: (row) => <Money cents={row.value} />,
              align: "right",
            },
            {
              key: "lastConsumed",
              header: t("invV2.lastUsed", "Last used"),
              cell: (row) =>
                row.lastConsumedAt ? formatDate(row.lastConsumedAt) : t("invV2.never", "Never"),
              align: "right",
            },
          ]}
        />
      </div>
    </Section>
  );
}

/** AC-C1: a style x color under 30 units sold is shown as "not enough data", never omitted. */
function SizeMixSection({ groups }: { groups: SizeMixGapGroup[] }) {
  const { t, i18n } = useTranslation();
  return (
    <Section
      title={t("invV2.sizeMix", "Size-mix gaps")}
      description={t(
        "invV2.sizeMixHint",
        "Where a size's share of stock is running ahead of or behind its share of sales.",
      )}
    >
      <div className="flex flex-col gap-4">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("profit.noData", "No orders in this period")}
          </p>
        )}
        {groups.map((g) => (
          <div key={`${g.styleCode}-${g.color}`} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{g.label}</p>
            {!g.hasEnoughUnits ? (
              <p className="text-xs text-muted-foreground">
                {t("invV2.notEnoughData", "Not enough data ({{n}} units sold)", { n: g.unitsSold })}
              </p>
            ) : (
              <MiniTable
                caption={g.label}
                rows={g.sizes}
                rowKey={(row) => row.blankVariantId}
                columns={[
                  { key: "size", header: t("invV2.size", "Size"), cell: (row) => row.size },
                  {
                    key: "salesShare",
                    header: t("invV2.salesShare", "Sales share"),
                    cell: (row) => formatPctNumberLocale(row.salesSharePct),
                    align: "right",
                  },
                  {
                    key: "stockShare",
                    header: t("invV2.stockShare", "Stock share"),
                    cell: (row) => formatPctNumberLocale(row.stockSharePct),
                    align: "right",
                  },
                  {
                    key: "gap",
                    header: t("invV2.gap", "Gap"),
                    cell: (row) =>
                      row.gapPts === null ? "—" : formatPoints(row.gapPts, i18n.language),
                    align: "right",
                  },
                  {
                    key: "cover",
                    header: t("invV2.coverDays", "Cover (days)"),
                    cell: (row) => (row.coverDays === null ? "—" : row.coverDays.toFixed(0)),
                    align: "right",
                  },
                ]}
              />
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function StockoutSection({ data }: { data: InventoryHealth }) {
  const { t } = useTranslation();
  const s = data.stockoutExposure;
  return (
    <Section
      title={t("invV2.stockoutExposure", "Stockout exposure")}
      description={t(
        "invV2.stockoutExposureHint",
        "Sold units waiting on a blank that's out of stock.",
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile label={t("invV2.unitsAtRisk", "Units waiting")} value={s.units} />
          <KpiTile label={t("invV2.blanksAtRisk", "Blanks out of stock")} value={s.blanks} />
          <KpiTile
            label={t("invV2.revenueAtRisk", "Revenue at risk")}
            value={<Money cents={s.revenueAtRisk} />}
          />
        </div>
        <MiniTable
          caption={t("invV2.stockoutExposure", "Stockout exposure")}
          rows={s.rows}
          rowKey={(row) => row.blankVariantId}
          columns={[
            { key: "label", header: t("invV2.variant", "Variant"), cell: (row) => row.label },
            {
              key: "units",
              header: t("invV2.unitsAtRisk", "Units waiting"),
              cell: (row) => row.units,
              align: "right",
            },
            {
              key: "revenue",
              header: t("invV2.revenueAtRisk", "Revenue at risk"),
              cell: (row) => <Money cents={row.revenueAtRisk} />,
              align: "right",
            },
            {
              key: "shipBy",
              header: t("invV2.earliestShipBy", "Earliest ship-by"),
              cell: (row) => (row.earliestShipBy ? formatDate(row.earliestShipBy) : "—"),
              align: "right",
            },
          ]}
        />
      </div>
    </Section>
  );
}

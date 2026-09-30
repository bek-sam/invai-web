import type {
  LateDriverRow,
  Operations,
  ORDER_ITEM_STATES,
  PressStationRow,
} from "@invai/contracts";
import { Button, Money } from "@invai/ui";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section } from "../../components/page";
import { formatPctNumberLocale } from "../../lib/format";
import { KpiTile, MiniTable, NotEnoughHistoryBanner } from "./shared";

/**
 * AC-B1/B2/B3: reprint cost, film waste, waits and the bottleneck step, measured press minutes
 * per station, and late-shipment drivers, all from one `analytics.operations` call. Stations and
 * vendors only, never a person's name (spec Track B rule).
 */
export function OperationsView({ data }: { data: Operations }) {
  return (
    <div className="flex flex-col gap-4">
      <NotEnoughHistoryBanner hasEnoughHistory={data.hasEnoughHistory} />
      <ReprintCostSection data={data} />
      <FilmWasteSection data={data} />
      <WaitsSection data={data} />
      <PressMinutesSection rows={data.pressMinutesPerUnit} />
      <LateDriversSection data={data} />
    </div>
  );
}

function ReprintCostSection({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const r = data.reprintCost;
  return (
    <Section
      title={t("opsV2.reprintCost", "Reprint cost")}
      description={t("opsV2.reprintCostHint", "What reprints cost, by reason, station and vendor.")}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile
            label={t("opsV2.reprintTotal", "Reprint cost")}
            value={<Money cents={r.total} />}
          />
          <KpiTile label={t("opsV2.reprints", "Reprints")} value={r.reprints} />
          <KpiTile
            label={t("opsV2.reprintRate", "Reprint rate")}
            value={r.ratePct === null ? "—" : formatPctNumberLocale(r.ratePct)}
            caption={
              r.ratePct === null
                ? t("opsV2.notEnoughItems", "Not enough items pressed yet")
                : undefined
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniTable
            caption={t("opsV2.byReason", "By reason")}
            rows={r.byReason}
            rowKey={(row) => row.key}
            columns={[
              {
                key: "label",
                header: t("opsV2.reason", "Reason"),
                cell: (row) => t(`reprintReason.${row.key}`, row.label),
              },
              {
                key: "reprints",
                header: t("opsV2.count", "Count"),
                cell: (row) => row.reprints,
                align: "right",
              },
              {
                key: "cost",
                header: t("opsV2.cost", "Cost"),
                cell: (row) => <Money cents={row.cost} />,
                align: "right",
              },
            ]}
          />
          <MiniTable
            caption={t("opsV2.byStation", "By station")}
            rows={r.byStation}
            rowKey={(row) => row.key}
            columns={[
              { key: "label", header: t("opsV2.station", "Station"), cell: (row) => row.label },
              {
                key: "reprints",
                header: t("opsV2.count", "Count"),
                cell: (row) => row.reprints,
                align: "right",
              },
              {
                key: "cost",
                header: t("opsV2.cost", "Cost"),
                cell: (row) => <Money cents={row.cost} />,
                align: "right",
              },
            ]}
          />
          <MiniTable
            caption={t("opsV2.byVendor", "By vendor")}
            rows={r.byVendor}
            rowKey={(row) => row.key}
            columns={[
              { key: "label", header: t("opsV2.vendor", "Vendor"), cell: (row) => row.label },
              {
                key: "reprints",
                header: t("opsV2.count", "Count"),
                cell: (row) => row.reprints,
                align: "right",
              },
              {
                key: "cost",
                header: t("opsV2.cost", "Cost"),
                cell: (row) => <Money cents={row.cost} />,
                align: "right",
              },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}

function FilmWasteSection({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const f = data.filmWaste;
  return (
    <Section
      title={t("opsV2.filmWaste", "Film waste")}
      description={t("opsV2.filmWasteHint", "Sheet cost lost to unused film area, by vendor.")}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile label={t("opsV2.sheets", "Sheets")} value={f.sheets} />
          <KpiTile
            label={t("opsV2.wasteCost", "Waste cost")}
            value={<Money cents={f.wasteCost} />}
          />
          <KpiTile
            label={t("opsV2.filmUse", "Film use")}
            value={f.filmUsePct === null ? "—" : formatPctNumberLocale(f.filmUsePct)}
            caption={
              f.filmUsePct === null
                ? t("opsV2.notEnoughSheets", "Not enough sheets yet")
                : undefined
            }
          />
        </div>
        <MiniTable
          caption={t("opsV2.byVendor", "By vendor")}
          rows={f.byVendor}
          rowKey={(row) => row.key}
          columns={[
            { key: "label", header: t("opsV2.vendor", "Vendor"), cell: (row) => row.label },
            {
              key: "sheets",
              header: t("opsV2.sheets", "Sheets"),
              cell: (row) => row.sheets,
              align: "right",
            },
            {
              key: "wasteCost",
              header: t("opsV2.wasteCost", "Waste cost"),
              cell: (row) => <Money cents={row.wasteCost} />,
              align: "right",
            },
            {
              key: "filmUsePct",
              header: t("opsV2.filmUse", "Film use"),
              cell: (row) =>
                row.filmUsePct === null ? "—" : formatPctNumberLocale(row.filmUsePct),
              align: "right",
            },
          ]}
        />
      </div>
    </Section>
  );
}

const STATE_KEY: Record<(typeof ORDER_ITEM_STATES)[number], string> = {
  imported: "opsV2.state.imported",
  needs_mapping: "opsV2.state.needsMapping",
  ready: "opsV2.state.ready",
  needs_artwork: "opsV2.state.needsArtwork",
  on_sheet: "opsV2.state.onSheet",
  transfer_in: "opsV2.state.transferIn",
  pressed: "opsV2.state.pressed",
  packed: "opsV2.state.packed",
  shipped: "opsV2.state.shipped",
  delivered: "opsV2.state.delivered",
  on_hold: "opsV2.state.onHold",
  cancelled: "opsV2.state.cancelled",
};

function WaitsSection({ data }: { data: Operations }) {
  const { t } = useTranslation();
  return (
    <Section
      title={t("opsV2.waits", "Waits per step")}
      description={
        data.bottleneckStep
          ? t("opsV2.bottleneck", "{{step}} is the slowest step right now", {
              step: t(STATE_KEY[data.bottleneckStep], data.bottleneckStep),
            })
          : t("opsV2.noBottleneck", "Not enough entries yet to name a bottleneck")
      }
    >
      <MiniTable
        caption={t("opsV2.waits", "Waits per step")}
        rows={data.waits}
        rowKey={(row) => row.state}
        columns={[
          {
            key: "state",
            header: t("opsV2.step", "Step"),
            cell: (row) => (
              <span className="flex items-center gap-1.5">
                {row.state === data.bottleneckStep && (
                  <AlertTriangle className="size-3.5 text-warning" aria-hidden />
                )}
                {t(STATE_KEY[row.state], row.state)}
              </span>
            ),
          },
          {
            key: "entries",
            header: t("opsV2.entries", "Entries"),
            cell: (row) => row.entries,
            align: "right",
          },
          {
            key: "median",
            header: t("opsV2.medianHours", "Median hrs"),
            cell: (row) => (row.medianHours === null ? "—" : row.medianHours.toFixed(1)),
            align: "right",
          },
          {
            key: "p90",
            header: t("opsV2.p90Hours", "P90 hrs"),
            cell: (row) => (row.p90Hours === null ? "—" : row.p90Hours.toFixed(1)),
            align: "right",
          },
          {
            key: "stillWaiting",
            header: t("opsV2.stillWaiting", "Still waiting"),
            cell: (row) => row.stillWaiting,
            align: "right",
          },
        ]}
      />
    </Section>
  );
}

/** AC-B2: > 25% off the labor setting with >= 100 timed units gets a suggestion; fewer says "not enough scans yet". */
function PressMinutesSection({ rows }: { rows: PressStationRow[] }) {
  const { t } = useTranslation();
  const suggest = rows.find((r) => r.suggestUpdateLaborSetting);
  return (
    <Section
      title={t("opsV2.pressMinutes", "Press minutes per unit")}
      description={t(
        "opsV2.pressMinutesHint",
        "Measured press time per station, vs. your labor setting.",
      )}
      actions={
        suggest && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/costs">
              {t("opsV2.updateLaborSetting", "Update labor setting")}
            </Link>
          </Button>
        )
      }
    >
      <MiniTable
        caption={t("opsV2.pressMinutes", "Press minutes per unit")}
        rows={rows}
        rowKey={(row) => row.stationId}
        columns={[
          { key: "station", header: t("opsV2.station", "Station"), cell: (row) => row.stationName },
          {
            key: "timed",
            header: t("opsV2.timedUnits", "Timed units"),
            cell: (row) => row.timedUnits,
            align: "right",
          },
          {
            key: "measured",
            header: t("opsV2.measuredMinutes", "Measured min/unit"),
            cell: (row) =>
              row.medianMinutes === null
                ? t("opsV2.notEnoughScans", "Not enough scans yet")
                : row.medianMinutes.toFixed(2),
            align: "right",
          },
          {
            key: "setting",
            header: t("opsV2.settingMinutes", "Setting min/unit"),
            cell: (row) => row.settingMinutes.toFixed(2),
            align: "right",
          },
        ]}
      />
    </Section>
  );
}

/** AC-B3: cuts under 30 shipped orders show counts only; copy is "were more often", never "caused". */
function LateDriversSection({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const d = data.lateDrivers;
  return (
    <Section
      title={t("opsV2.lateDrivers", "Late-shipment drivers")}
      description={t(
        "opsV2.lateDriversHint",
        "Which cuts of orders were more often late, not what caused it.",
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiTile label={t("opsV2.shippedOrders", "Shipped orders")} value={d.shippedOrders} />
          <KpiTile label={t("opsV2.lateOrders", "Late orders")} value={d.lateOrders} />
          <KpiTile
            label={t("opsV2.lateRate", "Late rate")}
            value={d.latePct === null ? "—" : formatPctNumberLocale(d.latePct)}
          />
        </div>
        <MiniTable<LateDriverRow>
          caption={t("opsV2.lateDrivers", "Late-shipment drivers")}
          rows={d.rows}
          rowKey={(row, i) => `${row.driver}-${row.value}-${i}`}
          columns={[
            {
              key: "driver",
              header: t("opsV2.driver", "Cut"),
              cell: (row) => t(`opsV2.driverName.${row.driver}`, row.driver),
            },
            { key: "value", header: t("opsV2.value", "Value"), cell: (row) => row.label },
            {
              key: "shipped",
              header: t("opsV2.shippedOrders", "Shipped orders"),
              cell: (row) => row.shippedOrders,
              align: "right",
            },
            {
              key: "late",
              header: t("opsV2.lateOrders", "Late orders"),
              cell: (row) => row.lateOrders,
              align: "right",
            },
            {
              key: "latePct",
              header: t("opsV2.lateRate", "Late rate"),
              cell: (row) =>
                row.latePct === null
                  ? t("opsV2.notEnoughOrders", "Not enough orders yet")
                  : formatPctNumberLocale(row.latePct),
              align: "right",
            },
          ]}
        />
      </div>
    </Section>
  );
}

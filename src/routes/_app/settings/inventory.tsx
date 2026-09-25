import type { InventorySettings, Supplier, SupplierInfo } from "@invai/contracts";
import { SUPPLIERS } from "@invai/contracts";
import { Button, Card, Checkbox, Input, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Page } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { centsToDollarsInput, parseDollarsToCents } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/inventory")({
  component: InventorySettingsPage,
});

function InventorySettingsPage() {
  const { t } = useTranslation();
  const settings = useQuery(orpc.inventory.settings.get.queryOptions({ input: {} }));
  const suppliers = useQuery(orpc.inventory.suppliers.list.queryOptions({ input: {} }));
  return (
    <Page
      wide={false}
      title={t("nav.inventorySettings", "Inventory settings")}
      description={t(
        "invSettings.subtitle",
        "Supplier accounts, reorder timing and how new stock is reserved.",
      )}
    >
      {settings.isPending || suppliers.isPending ? (
        <SkeletonRows rows={8} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : suppliers.isError ? (
        <ErrorState error={suppliers.error} onRetry={() => void suppliers.refetch()} />
      ) : (
        <SettingsForm
          key={JSON.stringify(settings.data)}
          settings={settings.data}
          suppliers={suppliers.data.items}
        />
      )}
    </Page>
  );
}

type SupplierRow = {
  freeFreightThreshold: string;
  accountNumber: string;
  apiKey: string;
  clear: boolean;
};

function SettingsForm({
  settings,
  suppliers,
}: {
  settings: InventorySettings;
  suppliers: SupplierInfo[];
}) {
  const { t } = useTranslation();
  const can = useCan();
  const editable = can("purchasing.manage");
  const queryClient = useQueryClient();
  const hasApiKey = Object.fromEntries(suppliers.map((s) => [s.supplier, s.hasApiKey])) as Record<
    Supplier,
    boolean
  >;
  const [rows, setRows] = useState<Record<Supplier, SupplierRow>>(
    Object.fromEntries(
      settings.suppliers.map((s) => [
        s.supplier,
        {
          freeFreightThreshold: centsToDollarsInput(s.freeFreightThreshold),
          accountNumber: s.accountNumber ?? "",
          apiKey: "",
          clear: false,
        },
      ]),
    ) as Record<Supplier, SupplierRow>,
  );
  const [velocityWindowDays, setVelocityWindowDays] = useState(String(settings.velocityWindowDays));
  const [leadTimeDays, setLeadTimeDays] = useState(String(settings.leadTimeDays));
  const [safetyDays, setSafetyDays] = useState(String(settings.safetyDays));
  const [reserveOnImport, setReserveOnImport] = useState(settings.reserveOnImport);

  const save = useMutation(
    orpc.inventory.settings.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings.saved", "Settings saved"));
        void queryClient.invalidateQueries({ queryKey: orpc.inventory.key() });
      },
    }),
  );

  function setRow(supplier: Supplier, patch: Partial<SupplierRow>) {
    setRows({ ...rows, [supplier]: { ...rows[supplier], ...patch } });
  }

  const thresholds = SUPPLIERS.map((s) => parseDollarsToCents(rows[s].freeFreightThreshold));
  const valid = thresholds.every((c) => c !== null);
  const velocity = Number.parseInt(velocityWindowDays, 10);
  const lead = Number.parseInt(leadTimeDays, 10);
  const safety = Number.parseInt(safetyDays, 10);
  const timingValid =
    Number.isInteger(velocity) &&
    velocity > 0 &&
    Number.isInteger(lead) &&
    lead >= 0 &&
    Number.isInteger(safety) &&
    safety >= 0;

  function save_() {
    save.mutate({
      suppliers: SUPPLIERS.map((s) => {
        const r = rows[s];
        const cents = parseDollarsToCents(r.freeFreightThreshold) ?? 0;
        return {
          supplier: s,
          freeFreightThreshold: cents,
          accountNumber: r.accountNumber.trim() || null,
          apiKey: r.clear ? "" : r.apiKey.trim() || null,
        };
      }),
      velocityWindowDays: velocity,
      leadTimeDays: lead,
      safetyDays: safety,
      reserveOnImport,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {SUPPLIERS.map((s) => (
        <Card key={s} className="flex flex-col gap-3 p-4">
          <p className="font-medium">{t(`supplier.${s}`, s)}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("invSettings.accountNumber", "Account number")} htmlFor={`${s}-acct`}>
              <Input
                id={`${s}-acct`}
                value={rows[s].accountNumber}
                disabled={!editable}
                onChange={(e) => setRow(s, { accountNumber: e.target.value })}
              />
            </Field>
            <Field
              label={t("invSettings.freeFreight", "Free-freight threshold ($)")}
              htmlFor={`${s}-ff`}
            >
              <Input
                id={`${s}-ff`}
                inputMode="decimal"
                disabled={!editable}
                value={rows[s].freeFreightThreshold}
                onChange={(e) => setRow(s, { freeFreightThreshold: e.target.value })}
              />
            </Field>
            <Field
              label={t("invSettings.apiKey", "API key")}
              htmlFor={`${s}-key`}
              hint={
                hasApiKey[s] && !rows[s].clear
                  ? t("invSettings.apiKeySet", "•••••••• (set) — type a new key to replace it")
                  : t("invSettings.apiKeyNone", "Not connected; type a key to connect")
              }
            >
              <div className="flex gap-1">
                <Input
                  id={`${s}-key`}
                  type="password"
                  autoComplete="off"
                  disabled={!editable || rows[s].clear}
                  placeholder={hasApiKey[s] ? "••••••••" : ""}
                  value={rows[s].apiKey}
                  onChange={(e) => setRow(s, { apiKey: e.target.value, clear: false })}
                />
                {hasApiKey[s] && editable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRow(s, { clear: !rows[s].clear, apiKey: "" })}
                  >
                    {rows[s].clear ? t("action.cancel") : t("invSettings.removeKey", "Remove")}
                  </Button>
                )}
              </div>
            </Field>
          </div>
        </Card>
      ))}
      <Card className="flex flex-col gap-3 p-4">
        <p className="font-medium">{t("invSettings.timing", "Reorder timing")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label={t("invSettings.velocity", "Velocity window (days)")}
            htmlFor="velocity-days"
            hint={t("invSettings.velocityHint", "Days of history used to estimate daily usage")}
          >
            <Input
              id="velocity-days"
              inputMode="numeric"
              disabled={!editable}
              value={velocityWindowDays}
              onChange={(e) => setVelocityWindowDays(e.target.value)}
            />
          </Field>
          <Field label={t("invSettings.leadDays", "Lead days")} htmlFor="lead-days">
            <Input
              id="lead-days"
              inputMode="numeric"
              disabled={!editable}
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
            />
          </Field>
          <Field label={t("invSettings.safetyDays", "Safety days")} htmlFor="safety-days">
            <Input
              id="safety-days"
              inputMode="numeric"
              disabled={!editable}
              value={safetyDays}
              onChange={(e) => setSafetyDays(e.target.value)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={reserveOnImport}
            disabled={!editable}
            onCheckedChange={(v) => setReserveOnImport(!!v)}
          />
          {t("invSettings.reserveOnImport", "Reserve stock as soon as an order is imported")}
        </label>
      </Card>
      {editable && (
        <div className="flex justify-end">
          <Button onClick={save_} disabled={!valid || !timingValid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

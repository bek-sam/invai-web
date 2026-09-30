import { CHANNEL_RULES, type CostSettings } from "@invai/contracts";
import { Button, Input, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { centsToDollarsInput, parseDollarsToCents } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/costs")({
  component: CostsPage,
});

function CostsPage() {
  const { t } = useTranslation();
  const q = useQuery(orpc.finance.costSettings.get.queryOptions({ input: {} }));
  return (
    <Page
      wide={false}
      title={t("nav.costs")}
      description={t(
        "costs.subtitle",
        "Fees and unit costs used for true profit. Changes recompute the last 90 days.",
      )}
    >
      {q.isPending ? (
        <SkeletonRows rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <CostsForm key={q.data.updatedAt} settings={q.data} />
      )}
    </Page>
  );
}

function CostsForm({ settings }: { settings: CostSettings }) {
  const { t } = useTranslation();
  const can = useCan();
  const editable = can("finance.manage");
  const queryClient = useQueryClient();
  const [fees, setFees] = useState(settings.feeTables.map((f) => ({ ...f })));
  const [transfer, setTransfer] = useState(String(settings.transferCentsPerSqIn));
  const [packaging, setPackaging] = useState(centsToDollarsInput(settings.packagingPerOrder));
  const [labor, setLabor] = useState(centsToDollarsInput(settings.laborRatePerHour));
  const [minutes, setMinutes] = useState(String(settings.laborMinutesPerItem));
  const [ads, setAds] = useState(settings.adsAllocation);
  const [fixedMonthly, setFixedMonthly] = useState(
    settings.fixedMonthlyCents == null ? "" : centsToDollarsInput(settings.fixedMonthlyCents),
  );
  const save = useMutation(
    orpc.finance.costSettings.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("costs.saved", "Saved; profit is being recomputed"));
        void queryClient.invalidateQueries({ queryKey: orpc.finance.key() });
      },
    }),
  );
  const pkg = parseDollarsToCents(packaging);
  const rate = parseDollarsToCents(labor);
  const fixedMonthlyCents = parseDollarsToCents(fixedMonthly);
  const setFee = (i: number, k: keyof (typeof fees)[number], v: string) =>
    setFees(
      fees.map((f, j) =>
        j === i
          ? { ...f, [k]: k.endsWith("Cents") ? (parseDollarsToCents(v) ?? 0) : Number(v) }
          : f,
      ),
    );
  return (
    <div className="flex flex-col gap-4">
      <Section title={t("costs.fees", "Channel fees")}>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t("orders.channel", "Channel")}
                </th>
                <th className="px-2 py-2 text-left font-medium">
                  {t("costs.transactionPct", "Transaction %")}
                </th>
                <th className="px-2 py-2 text-left font-medium">
                  {t("costs.paymentPct", "Payment %")}
                </th>
                <th className="px-2 py-2 text-left font-medium">
                  {t("costs.paymentFixed", "Payment fixed ($)")}
                </th>
                <th className="px-2 py-2 text-left font-medium">
                  {t("costs.perOrder", "Per order ($)")}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t("costs.listingFee", "Listing fee ($)")}
                </th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f, i) => (
                <tr key={f.channel} className="border-t border-border">
                  <td
                    className="px-4 py-1.5 font-medium"
                    title={CHANNEL_RULES[f.channel].fees.note}
                  >
                    {CHANNEL_RULES[f.channel].label}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-20"
                      type="number"
                      step="0.1"
                      value={f.transactionPct}
                      onChange={(e) => setFee(i, "transactionPct", e.target.value)}
                      disabled={!editable}
                      aria-label={t("costs.transactionPct", "Transaction %")}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-20"
                      type="number"
                      step="0.1"
                      value={f.paymentPct}
                      onChange={(e) => setFee(i, "paymentPct", e.target.value)}
                      disabled={!editable}
                      aria-label={t("costs.paymentPct", "Payment %")}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-20"
                      defaultValue={centsToDollarsInput(f.paymentFixedCents)}
                      onBlur={(e) => setFee(i, "paymentFixedCents", e.target.value)}
                      disabled={!editable}
                      aria-label={t("costs.paymentFixed", "Payment fixed ($)")}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-20"
                      defaultValue={centsToDollarsInput(f.perOrderCents)}
                      onBlur={(e) => setFee(i, "perOrderCents", e.target.value)}
                      disabled={!editable}
                      aria-label={t("costs.perOrder", "Per order ($)")}
                    />
                  </td>
                  <td className="px-4 py-1.5">
                    <Input
                      className="h-8 w-20"
                      defaultValue={centsToDollarsInput(f.listingFeeCents)}
                      onBlur={(e) => setFee(i, "listingFeeCents", e.target.value)}
                      disabled={!editable}
                      aria-label={t("costs.listingFee", "Listing fee ($)")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={t("costs.unitCosts", "Unit costs")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("costs.transfer", "Transfer cost (cents per sq in)")}
            htmlFor="c-transfer"
            hint={t("costs.transferHint", "Film + ink per square inch of print")}
          >
            <Input
              id="c-transfer"
              type="number"
              min={0}
              value={transfer}
              onChange={(e) => setTransfer(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label={t("costs.packaging", "Packaging per order ($)")} htmlFor="c-pkg">
            <Input
              id="c-pkg"
              inputMode="decimal"
              value={packaging}
              onChange={(e) => setPackaging(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label={t("costs.laborRate", "Labor rate per hour ($)")} htmlFor="c-labor">
            <Input
              id="c-labor"
              inputMode="decimal"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label={t("costs.minutes", "Labor minutes per item")} htmlFor="c-min">
            <Input
              id="c-min"
              type="number"
              step="0.5"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label={t("costs.ads", "Spread ad spend by")} htmlFor="c-ads">
            <NativeSelect
              id="c-ads"
              value={ads}
              onChange={(e) => setAds(e.target.value as typeof ads)}
              disabled={!editable}
            >
              <option value="revenue_share">
                {t("costs.revenueShare", "Channel revenue share")}
              </option>
              <option value="per_order">{t("costs.perOrderAlloc", "Evenly per order")}</option>
            </NativeSelect>
          </Field>
        </div>
      </Section>
      <Section
        title={t("costs.breakEven", "Break-even")}
        description={t(
          "costs.breakEvenSubtitle",
          "Used by Profit → Break-even to show orders per month needed to cover the shop's bills.",
        )}
      >
        <Field
          label={t("costs.fixedMonthly", "Fixed monthly costs ($)")}
          htmlFor="c-fixed"
          hint={t(
            "costs.fixedMonthlyHint",
            "Rent, salaries, software — whatever doesn't change with how many shirts you print. Labor per shirt is already counted above; don't add it again here.",
          )}
          error={
            fixedMonthly.trim() !== "" && fixedMonthlyCents === null
              ? t("costs.fixedMonthlyInvalid", "Enter a dollar amount, or leave it blank")
              : undefined
          }
        >
          <Input
            id="c-fixed"
            inputMode="decimal"
            placeholder={t("costs.fixedMonthlyPlaceholder", "Not set")}
            value={fixedMonthly}
            onChange={(e) => setFixedMonthly(e.target.value)}
            disabled={!editable}
          />
        </Field>
      </Section>
      {editable && (
        <div className="flex justify-end">
          <Button
            disabled={
              pkg === null ||
              rate === null ||
              (fixedMonthly.trim() !== "" && fixedMonthlyCents === null) ||
              save.isPending
            }
            onClick={() =>
              save.mutate({
                feeTables: fees,
                transferCentsPerSqIn: Math.max(0, Math.round(Number(transfer) || 0)),
                packagingPerOrder: pkg ?? 0,
                laborRatePerHour: rate ?? 0,
                laborMinutesPerItem: Number(minutes) || 0,
                adsAllocation: ads,
                fixedMonthlyCents: fixedMonthly.trim() === "" ? null : fixedMonthlyCents,
              })
            }
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

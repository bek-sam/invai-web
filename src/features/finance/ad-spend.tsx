import { type AdSpend, CHANNELS, type Channel } from "@invai/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@invai/ui";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect } from "../../components/page";
import { centsToDollarsInput, parseDollarsToCents, toDateInput } from "../../lib/format";

export type AdSpendDraft = {
  date: string;
  channel: Channel;
  amount: string;
  campaign: string;
  note: string;
};

export function draftOf(row?: AdSpend | null): AdSpendDraft {
  return {
    date: row?.date ?? toDateInput(new Date()),
    channel: row?.channel ?? "etsy",
    amount: row ? centsToDollarsInput(row.amount) : "",
    campaign: row?.campaign ?? "",
    note: row?.note ?? "",
  };
}

/** Create or edit one ad spend entry. */
export function AdSpendDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AdSpend | null;
  onSubmit: (input: {
    date: string;
    channel: Channel;
    amount: number;
    campaign: string | null;
    note: string | null;
  }) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AdSpendDraft>(() => draftOf(editing));
  const amountCents = parseDollarsToCents(draft.amount);
  const valid = !!draft.date && amountCents !== null && amountCents >= 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setDraft(draftOf(editing));
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? t("adSpend.edit", "Edit spend") : t("adSpend.add", "Add spend")}
          </DialogTitle>
          <DialogDescription>
            {t("adSpend.dialogHint", "Spend feeds the ad allocation setting in true profit.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("adSpend.date", "Date")} htmlFor="as-date">
            <Input
              id="as-date"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </Field>
          <Field label={t("orders.channel", "Channel")} htmlFor="as-channel">
            <NativeSelect
              id="as-channel"
              value={draft.channel}
              onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value as Channel }))}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`channel.${c}`, c)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={t("adSpend.amount", "Amount")}
            htmlFor="as-amount"
            hint={t("adSpend.amountHint", "In dollars")}
            error={
              amountCents === null && draft.amount
                ? t("adSpend.badAmount", "Invalid amount")
                : undefined
            }
          >
            <Input
              id="as-amount"
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
            />
          </Field>
          <Field label={t("adSpend.campaign", "Campaign")} htmlFor="as-campaign">
            <Input
              id="as-campaign"
              value={draft.campaign}
              onChange={(e) => setDraft((d) => ({ ...d, campaign: e.target.value }))}
            />
          </Field>
          <Field label={t("adSpend.note", "Note")} htmlFor="as-note" className="sm:col-span-2">
            <Input
              id="as-note"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!valid || pending}
            onClick={() =>
              onSubmit({
                date: draft.date,
                channel: draft.channel,
                amount: amountCents ?? 0,
                campaign: draft.campaign.trim() || null,
                note: draft.note.trim() || null,
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** `date,channel,amount,campaign,note` — the columns `finance.adSpend.importCsv` reads. */
export function adSpendCsvTemplate(): string {
  const header = ["date", "channel", "amount", "campaign", "note"];
  const example = ["2026-09-01", "etsy", "25.00", "Fall sale", "Boosted listings"];
  return `${[header, example].map((r) => r.join(",")).join("\r\n")}\r\n`;
}

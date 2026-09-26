import { Button, Input, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DefList, Field, NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { formatDateTime } from "../../../lib/format";
import { meQueryOptions, useCan, useMe } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/company")({
  component: CompanyPage,
});

const TIMEZONES = [
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Mexico_City",
  "UTC",
];

function CompanyPage() {
  const { t } = useTranslation();
  const me = useMe();
  const can = useCan();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.org.name);
  const [tz, setTz] = useState(me.org.timezone);
  // Etsy Creativity Standards requires production-partner disclosure (production_partner_ids);
  // a POD/DTF shop needs this set before it can generate or publish an Etsy listing (T-8-1 AC2).
  const [partnerName, setPartnerName] = useState(me.org.productionPartner?.name ?? "");
  const [partnerEtsyId, setPartnerEtsyId] = useState(me.org.productionPartner?.etsyPartnerId ?? "");
  const save = useMutation(
    orpc.me.updateOrg.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings.saved", "Settings saved"));
        void queryClient.invalidateQueries({ queryKey: meQueryOptions().queryKey });
      },
    }),
  );
  const editable = can("org.manage");
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];
  return (
    <Page
      wide={false}
      title={t("nav.company")}
      description={t("company.subtitle", "Your company profile and locations.")}
    >
      <div className="flex flex-col gap-4">
        <Section title={t("company.profile", "Profile")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("company.name", "Company name")} htmlFor="c-name">
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!editable}
              />
            </Field>
            <Field
              label={t("company.timezone", "Time zone")}
              htmlFor="c-tz"
              hint={t("company.tzHint", "Ship-by days and 'today' use this zone")}
            >
              <NativeSelect
                id="c-tz"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                disabled={!editable}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <DefList
            className="mt-4"
            items={[
              [
                t("company.type", "Type"),
                me.org.type === "vendor" ? t("shell.vendor", "Vendor") : t("company.shop", "Shop"),
              ],
              [t("company.plan", "Plan"), me.org.plan ?? "—"],
              [t("company.slug", "Slug"), me.org.slug],
              [t("company.created", "Created"), formatDateTime(me.org.createdAt)],
            ]}
          />
          {me.org.type === "shop" && (
            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <Field
                label={t("company.productionPartner", "Production partner")}
                htmlFor="c-partner-name"
                hint={t(
                  "company.productionPartnerHint",
                  "Required to publish DTF listings on Etsy (production_partner_ids)",
                )}
              >
                <Input
                  id="c-partner-name"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder={t("company.productionPartnerPlaceholder", "e.g. Cactus Print Co")}
                  disabled={!editable}
                />
              </Field>
              <Field
                label={t("company.etsyPartnerId", "Etsy partner ID (optional)")}
                htmlFor="c-partner-etsy-id"
                hint={t(
                  "company.etsyPartnerIdHint",
                  "From getShopProductionPartners once Etsy is connected",
                )}
              >
                <Input
                  id="c-partner-etsy-id"
                  value={partnerEtsyId}
                  onChange={(e) => setPartnerEtsyId(e.target.value)}
                  disabled={!editable}
                />
              </Field>
            </div>
          )}
          {editable && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() =>
                  save.mutate({
                    name: name.trim(),
                    timezone: tz,
                    productionPartner: partnerName.trim()
                      ? { name: partnerName.trim(), etsyPartnerId: partnerEtsyId.trim() || null }
                      : null,
                  })
                }
                disabled={!name.trim() || save.isPending}
              >
                {save.isPending && <Loader2 className="animate-spin" />}
                {t("action.save")}
              </Button>
            </div>
          )}
        </Section>
        {me.org.type === "shop" && <Locations />}
      </div>
    </Page>
  );
}

function Locations() {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const q = useQuery(orpc.locations.list.queryOptions({ input: {} }));
  const [name, setName] = useState("");
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.locations.key() });
  const create = useMutation(
    orpc.locations.create.mutationOptions({
      onSuccess: () => {
        setName("");
        invalidate();
      },
    }),
  );
  const del = useMutation(orpc.locations.delete.mutationOptions({ onSuccess: invalidate }));
  const setDefault = useMutation(orpc.locations.update.mutationOptions({ onSuccess: invalidate }));
  return (
    <Section title={t("company.locations", "Locations")}>
      {q.isPending ? (
        <SkeletonRows rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} compact onRetry={() => void q.refetch()} />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {q.data.items.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="font-medium">{l.name}</span>
              {l.address && (
                <span className="text-muted-foreground">
                  {l.address.city}, {l.address.state}
                </span>
              )}
              {l.isDefault ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("sheets.default", "default")}
                </span>
              ) : (
                can("org.manage") && (
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDefault.mutate({ id: l.id, isDefault: true })}
                    >
                      {t("company.makeDefault", "Make default")}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => del.mutate({ id: l.id })}
                      aria-label={t("action.delete")}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {can("org.manage") && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate({ name: name.trim(), address: null, isDefault: false });
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("company.newLocation", "New location name")}
          />
          <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
            <Plus />
            {t("action.create")}
          </Button>
        </form>
      )}
    </Section>
  );
}

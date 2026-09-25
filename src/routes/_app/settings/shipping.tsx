import { type Address, BATCH_STRATEGIES, type ShippingSettings } from "@invai/contracts";
import { Badge, Button, Checkbox, Input, Switch, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect, Page, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/shipping")({
  component: ShippingSettingsPage,
});

/** Carriers a shop can choose; the test carrier ("mock") is kept as saved, never shown. */
const CARRIER_CHOICES = ["usps", "ups"] as const;

const EMPTY_ADDRESS: Address = {
  name: "",
  company: null,
  street1: "",
  street2: null,
  city: "",
  state: "",
  zip: "",
  country: "US",
  phone: null,
  email: null,
};

type PresetDraft = {
  id: string;
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  tareOz: number;
  maxUnits: number | null;
  isDefault: boolean;
};

function ShippingSettingsPage() {
  const { t } = useTranslation();
  const q = useQuery(orpc.shipping.settings.get.queryOptions({ input: {} }));
  return (
    <Page
      wide={false}
      title={t("shipSettings.title", "Shipping settings")}
      description={t(
        "shipSettings.subtitle",
        "Where packages ship from, which carriers and boxes to use, and how labels print.",
      )}
      actions={
        <Button asChild variant="outline">
          <Link to="/shipping">{t("shipSettings.toShipping", "Go to Shipping")}</Link>
        </Button>
      }
    >
      {q.isPending ? (
        <SkeletonRows rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <SettingsEditor key={JSON.stringify(q.data)} settings={q.data} />
      )}
    </Page>
  );
}

/** Problems that stop a save, in plain words, keyed by field. */
function validate(
  from: Address,
  carriers: string[],
  presets: PresetDraft[],
  weights: { styleCode: string; weightOz: number }[],
  t: (k: string, d: string) => string,
) {
  const errors: Record<string, string> = {};
  const anyAddress = [from.name, from.street1, from.city, from.state, from.zip].some((v) =>
    v.trim(),
  );
  if (anyAddress) {
    for (const k of ["name", "street1", "city", "state", "zip"] as const)
      if (!from[k].trim()) errors[`from.${k}`] = t("shipSettings.required", "Required");
    if (from.zip.trim() && !/^\d{5}(-\d{4})?$/.test(from.zip.trim()))
      errors["from.zip"] = t("shipSettings.zipInvalid", "Use 5 digits, like 85004");
  }
  if (!carriers.some((c) => (CARRIER_CHOICES as readonly string[]).includes(c)))
    errors.carriers = t("shipSettings.carrierNeeded", "Choose at least one carrier.");
  presets.forEach((p, i) => {
    if (!p.name.trim()) errors[`preset.${i}.name`] = t("shipSettings.required", "Required");
    for (const k of ["lengthIn", "widthIn", "heightIn"] as const)
      if (!(p[k] > 0)) errors[`preset.${i}.${k}`] = t("shipSettings.positive", "Above 0");
    if (!(p.tareOz >= 0)) errors[`preset.${i}.tareOz`] = t("shipSettings.notNegative", "0 or more");
    if (p.maxUnits !== null && !(Number.isInteger(p.maxUnits) && p.maxUnits > 0))
      errors[`preset.${i}.maxUnits`] = t("shipSettings.wholeNumber", "A whole number above 0");
  });
  const seen = new Set<string>();
  weights.forEach((w, i) => {
    const code = w.styleCode.trim().toLowerCase();
    if (!code) errors[`weight.${i}.style`] = t("shipSettings.required", "Required");
    else if (seen.has(code))
      errors[`weight.${i}.style`] = t("shipSettings.styleTwice", "This style is already listed");
    seen.add(code);
    if (!(w.weightOz > 0)) errors[`weight.${i}.oz`] = t("shipSettings.positive", "Above 0");
  });
  return errors;
}

function SettingsEditor({ settings }: { settings: ShippingSettings }) {
  const { t } = useTranslation();
  const can = useCan();
  const canEdit = can("shipping.manage");
  const queryClient = useQueryClient();
  const [from, setFrom] = useState<Address>(settings.fromAddress ?? EMPTY_ADDRESS);
  const [carriers, setCarriers] = useState<string[]>(settings.allowedCarriers);
  const [labelFormat, setLabelFormat] = useState(settings.labelFormat);
  const [presets, setPresets] = useState<PresetDraft[]>(
    settings.packagePresets.map((p) => ({ ...p })),
  );
  const [weights, setWeights] = useState(settings.weightPerStyle.map((w) => ({ ...w })));
  const [strategy, setStrategy] = useState(settings.defaultStrategy);
  const [push, setPush] = useState(settings.trackingPushEnabled);
  const [tried, setTried] = useState(false);
  const errors = validate(from, carriers, presets, weights, t);
  const err = (k: string) => (tried ? errors[k] : undefined);
  const save = useMutation(
    orpc.shipping.settings.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings.saved", "Settings saved"));
        void queryClient.invalidateQueries({ queryKey: orpc.shipping.settings.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.me.key() });
      },
    }),
  );
  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length) {
      toast.error(t("shipSettings.fixFirst", "Fix the highlighted fields, then save."));
      return;
    }
    save.mutate({
      fromAddress: from.street1.trim() ? { ...from, zip: from.zip.trim() } : null,
      allowedCarriers: carriers as ShippingSettings["allowedCarriers"],
      labelFormat,
      packagePresets: presets.map(({ id, ...rest }) =>
        id ? { id, ...rest, name: rest.name.trim() } : { ...rest, name: rest.name.trim() },
      ),
      weightPerStyle: weights.map((w) => ({ styleCode: w.styleCode.trim(), weightOz: w.weightOz })),
      defaultStrategy: strategy,
      trackingPushEnabled: push,
    });
  };
  return (
    <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4">
      <CarrierAccount provider={settings.carrierProvider} />
      <FromAddress from={from} setFrom={setFrom} err={err} />
      <Section
        title={t("shipSettings.carriersTitle", "Carriers and labels")}
        description={t(
          "shipSettings.carriersHint",
          "Rates and labels only come from the carriers you turn on.",
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">
              {t("shipSettings.allowedCarriers", "Allowed carriers")}
            </legend>
            {CARRIER_CHOICES.map((c) => (
              <label key={c} className="flex min-h-6 items-center gap-2 text-sm">
                <Checkbox
                  checked={carriers.includes(c)}
                  onCheckedChange={(v) =>
                    setCarriers(v ? [...carriers, c] : carriers.filter((x) => x !== c))
                  }
                />
                {t(`carrier.${c}`, c.toUpperCase())}
              </label>
            ))}
            {err("carriers") && (
              <p role="alert" className="text-xs text-danger">
                {err("carriers")}
              </p>
            )}
          </fieldset>
          <Field
            label={t("shipSettings.labelFormat", "Label format")}
            htmlFor="s-label-format"
            hint={t(
              "shipSettings.labelFormatHint",
              "4×6 PDF prints on any label printer. ZPL files for thermal printers are coming soon.",
            )}
          >
            <NativeSelect
              id="s-label-format"
              value={labelFormat}
              onChange={(e) => setLabelFormat(e.target.value as typeof labelFormat)}
            >
              <option value="pdf">{t("shipSettings.formatPdf", "PDF, 4×6 in")}</option>
              <option value="zpl" disabled={labelFormat !== "zpl"}>
                {t("shipSettings.formatZpl", "ZPL for thermal printers (coming soon)")}
              </option>
            </NativeSelect>
          </Field>
        </div>
      </Section>
      <Presets presets={presets} setPresets={setPresets} err={err} canEdit={canEdit} />
      <StyleWeights weights={weights} setWeights={setWeights} err={err} canEdit={canEdit} />
      <Section title={t("ship.defaults", "Defaults")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("ship.strategyLabel", "Batch strategy")}
            htmlFor="s-strategy"
            hint={t(
              "shipSettings.strategyHint",
              'Which rate "Buy & print all" picks for each order.',
            )}
          >
            <NativeSelect
              id="s-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof strategy)}
            >
              {BATCH_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {t(`ship.strategy.${s}`, s.replace(/_/g, " "))}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 self-center text-sm">
            <Switch checked={push} onCheckedChange={setPush} />
            {t("ship.pushTracking", "Push tracking to channels automatically")}
          </label>
        </div>
      </Section>
      {canEdit && (
        <div className="sticky bottom-0 -mx-1 flex justify-end bg-background/90 px-1 py-2 backdrop-blur">
          <Button disabled={save.isPending} onClick={submit}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

type ErrFn = (key: string) => string | undefined;

function CarrierAccount({ provider }: { provider: ShippingSettings["carrierProvider"] }) {
  const { t } = useTranslation();
  const live = provider !== "mock";
  return (
    <Section
      title={t("shipSettings.accountTitle", "Carrier account")}
      actions={
        <Badge variant={live ? "success" : "warning"}>
          {live ? t("shipSettings.live", "Live") : t("shipSettings.testMode", "Test mode")}
        </Badge>
      }
    >
      <p className="text-sm text-muted-foreground">
        {live
          ? t(
              "shipSettings.liveHint",
              "Labels are real and postage is charged to your carrier account.",
            )
          : t(
              "shipSettings.testHint",
              "Labels are samples: no postage is charged and they can't be mailed. Live labels start once a carrier account is added.",
            )}
      </p>
    </Section>
  );
}

function FromAddress({
  from,
  setFrom,
  err,
}: {
  from: Address;
  setFrom: (a: Address) => void;
  err: ErrFn;
}) {
  const { t } = useTranslation();
  const optional = new Set<keyof Address>(["company", "street2", "phone"]);
  const fields: [keyof Address, string, string?][] = [
    ["name", t("ship.name", "Name"), "name"],
    ["company", t("ship.company", "Company"), "organization"],
    ["street1", t("ship.street1", "Street"), "address-line1"],
    ["street2", t("ship.street2", "Apt, suite"), "address-line2"],
    ["city", t("ship.city", "City"), "address-level2"],
    ["state", t("ship.state", "State"), "address-level1"],
    ["zip", t("ship.zip", "ZIP"), "postal-code"],
    ["phone", t("ship.phone", "Phone"), "tel"],
  ];
  return (
    <Section
      title={t("ship.fromAddress", "Ship-from address")}
      description={t(
        "shipSettings.fromHint",
        "Printed on every label as the return address. Carriers also use it for rates.",
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([k, label, auto]) => (
          <Field
            key={k}
            label={
              optional.has(k)
                ? t("shipSettings.optional", "{{label}} (optional)", { label })
                : label
            }
            htmlFor={`from-${k}`}
            error={err(`from.${k}`)}
          >
            <Input
              id={`from-${k}`}
              autoComplete={auto}
              aria-invalid={!!err(`from.${k}`)}
              value={(from[k] as string | null) ?? ""}
              onChange={(e) =>
                setFrom({ ...from, [k]: e.target.value || (optional.has(k) ? null : "") })
              }
            />
          </Field>
        ))}
      </div>
    </Section>
  );
}

function NumberInput({
  value,
  onChange,
  id,
  invalid,
  step = "0.1",
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  id: string;
  invalid: boolean;
  step?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      aria-invalid={invalid}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value === "" ? (allowEmpty ? null : Number.NaN) : Number(e.target.value));
      }}
    />
  );
}

function Presets({
  presets,
  setPresets,
  err,
  canEdit,
}: {
  presets: PresetDraft[];
  setPresets: (p: PresetDraft[]) => void;
  err: ErrFn;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const base = useId();
  const patch = (i: number, p: Partial<PresetDraft>) =>
    setPresets(presets.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const dims = [
    ["lengthIn", t("shipSettings.length", "Length (in)")],
    ["widthIn", t("shipSettings.width", "Width (in)")],
    ["heightIn", t("shipSettings.height", "Height (in)")],
    ["tareOz", t("shipSettings.tare", "Empty weight (oz)")],
  ] as const;
  return (
    <Section
      title={t("ship.presets", "Package presets")}
      description={t(
        "shipSettings.presetsHint",
        "The mailers and boxes you pack with. Orders get the smallest package that fits their item count.",
      )}
      actions={
        canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPresets([
                ...presets,
                {
                  id: "",
                  name: t("shipSettings.newPresetName", "Poly mailer"),
                  lengthIn: 12,
                  widthIn: 10,
                  heightIn: 1,
                  tareOz: 1,
                  maxUnits: 2,
                  isDefault: presets.length === 0,
                },
              ])
            }
          >
            <Plus />
            {t("ship.addPreset", "Add preset")}
          </Button>
        )
      }
    >
      {presets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "shipSettings.noPresets",
            "No packages yet. Add the mailer you use most so rates use its size.",
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {presets.map((p, i) => {
            const id = `${base}-${i}`;
            return (
              <li
                key={p.id || `new-${i}`}
                className="grid grid-cols-2 items-start gap-2 rounded-md border border-border p-3 sm:grid-cols-5"
              >
                <Field
                  label={t("ship.name", "Name")}
                  htmlFor={`${id}-name`}
                  error={err(`preset.${i}.name`)}
                  className="col-span-2 sm:col-span-5"
                >
                  <Input
                    id={`${id}-name`}
                    value={p.name}
                    aria-invalid={!!err(`preset.${i}.name`)}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                </Field>
                {dims.map(([k, label]) => (
                  <Field
                    key={k}
                    label={label}
                    htmlFor={`${id}-${k}`}
                    error={err(`preset.${i}.${k}`)}
                  >
                    <NumberInput
                      id={`${id}-${k}`}
                      value={p[k]}
                      invalid={!!err(`preset.${i}.${k}`)}
                      onChange={(v) => patch(i, { [k]: v ?? Number.NaN })}
                    />
                  </Field>
                ))}
                <Field
                  label={t("shipSettings.maxItems", "Up to (items)")}
                  htmlFor={`${id}-max`}
                  error={err(`preset.${i}.maxUnits`)}
                  hint={t("shipSettings.maxItemsHint", "Empty = any number")}
                >
                  <NumberInput
                    id={`${id}-max`}
                    step="1"
                    allowEmpty
                    value={p.maxUnits}
                    invalid={!!err(`preset.${i}.maxUnits`)}
                    onChange={(v) => patch(i, { maxUnits: v })}
                  />
                </Field>
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-5">
                  <label className="flex min-h-6 items-center gap-2 text-sm">
                    <Checkbox
                      checked={p.isDefault}
                      onCheckedChange={(v) =>
                        setPresets(
                          presets.map((x, j) => ({
                            ...x,
                            isDefault: j === i ? !!v : v ? false : x.isDefault,
                          })),
                        )
                      }
                    />
                    {t("shipSettings.defaultPreset", "Use when nothing else fits")}
                  </label>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => setPresets(presets.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                      {t("shipSettings.removePreset", "Remove {{name}}", {
                        name: p.name || t("shipSettings.thisPreset", "this package"),
                      })}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function StyleWeights({
  weights,
  setWeights,
  err,
  canEdit,
}: {
  weights: { styleCode: string; weightOz: number }[];
  setWeights: (w: { styleCode: string; weightOz: number }[]) => void;
  err: ErrFn;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const base = useId();
  const facets = useQuery(orpc.blanks.facets.queryOptions({ input: {}, retry: false }));
  const styles = facets.data?.styles ?? [];
  return (
    <Section
      title={t("shipSettings.weightsTitle", "Weight per style")}
      description={t(
        "shipSettings.weightsHint",
        "Set a shirt weight for a whole style, like hoodies, when the blank's own weight is wrong or missing.",
      )}
      actions={
        canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWeights([...weights, { styleCode: "", weightOz: 8 }])}
          >
            <Plus />
            {t("shipSettings.addWeight", "Add style")}
          </Button>
        )
      }
    >
      {weights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("shipSettings.noWeights", "Every style uses its blank's weight.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {weights.map((w, i) => {
            const id = `${base}-${i}`;
            const known = styles.some((s) => s.styleCode === w.styleCode);
            return (
              <li key={id} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-start gap-2">
                <Field
                  className="min-w-0"
                  label={t("shipSettings.style", "Style")}
                  htmlFor={`${id}-style`}
                  error={err(`weight.${i}.style`)}
                >
                  {styles.length > 0 ? (
                    <NativeSelect
                      id={`${id}-style`}
                      className="w-full min-w-0"
                      value={w.styleCode}
                      aria-invalid={!!err(`weight.${i}.style`)}
                      onChange={(e) =>
                        setWeights(
                          weights.map((x, j) =>
                            j === i ? { ...x, styleCode: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      <option value="">{t("shipSettings.pickStyle", "Choose a style")}</option>
                      {!known && w.styleCode && <option value={w.styleCode}>{w.styleCode}</option>}
                      {styles.map((s) => (
                        <option key={`${s.brand}-${s.styleCode}`} value={s.styleCode}>
                          {s.styleCode} · {s.styleName ?? s.style}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={`${id}-style`}
                      value={w.styleCode}
                      placeholder="G185"
                      aria-invalid={!!err(`weight.${i}.style`)}
                      onChange={(e) =>
                        setWeights(
                          weights.map((x, j) =>
                            j === i ? { ...x, styleCode: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  )}
                </Field>
                <Field
                  label={t("shipSettings.weightOz", "Weight (oz)")}
                  htmlFor={`${id}-oz`}
                  error={err(`weight.${i}.oz`)}
                >
                  <NumberInput
                    id={`${id}-oz`}
                    value={w.weightOz}
                    invalid={!!err(`weight.${i}.oz`)}
                    onChange={(v) =>
                      setWeights(
                        weights.map((x, j) => (j === i ? { ...x, weightOz: v ?? Number.NaN } : x)),
                      )
                    }
                  />
                </Field>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-6 text-danger"
                    onClick={() => setWeights(weights.filter((_, j) => j !== i))}
                    aria-label={
                      w.styleCode
                        ? t("shipSettings.removeWeight", "Remove style {{code}}", {
                            code: w.styleCode,
                          })
                        : t("shipSettings.removeWeightRow", "Remove this row")
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

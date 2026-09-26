import { type PersonalizationTemplate, TEMPLATE_FONTS, type TemplateSlot } from "@invai/contracts";
import { Badge, Button, Checkbox, Input, Skeleton, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Field, NativeSelect, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { fitSlotText } from "../../../features/personalization/fit";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/catalog/personalization/$templateId")({
  component: TemplatePage,
});

function TemplatePage() {
  const { t } = useTranslation();
  const { templateId } = Route.useParams();
  const isNew = templateId === "new";
  const q = useQuery(
    orpc.personalization.templates.get.queryOptions({ input: { id: templateId }, enabled: !isNew }),
  );
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/catalog/personalization">
          <ArrowLeft />
          {t("nav.personalization")}
        </Link>
      </Button>
      {isNew ? (
        <TemplateEditor template={null} />
      ) : q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonRows rows={8} />
          <Skeleton className="h-80" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <TemplateEditor key={q.data.updatedAt} template={q.data} />
      )}
    </div>
  );
}

const newSlot = (i: number): TemplateSlot => ({
  name: i === 0 ? "name" : `line${i + 1}`,
  kind: "text",
  xIn: 1,
  yIn: 1 + i * 1.5,
  wIn: 8,
  hIn: 1.25,
  fontFamily: "Inter Bold",
  fontSizePt: 72,
  minFontSizePt: null,
  maxLines: null,
  strokeWidthPt: 0,
  strokeColor: null,
  fit: "fit",
  color: "#111111",
  align: "center",
  maxChars: 16,
  uppercase: false,
  sourceQuestion: null,
  required: true,
  placeholder: null,
});

function TemplateEditor({ template }: { template: PersonalizationTemplate | null }) {
  const { t } = useTranslation();
  const can = useCan();
  const editable = can("personalization.manage");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(template?.name ?? "");
  const [widthIn, setWidthIn] = useState(String(template?.widthIn ?? 10));
  const [heightIn, setHeightIn] = useState(String(template?.heightIn ?? 4));
  const [dpi, _setDpi] = useState(String(template?.dpi ?? 300));
  const [rows, setRows] = useState<{ key: number; slot: TemplateSlot }[]>(() =>
    (template?.slots ?? [newSlot(0)]).map((slot, i) => ({ key: i, slot })),
  );
  const nextKey = useRef(rows.length);
  const slots = rows.map((r) => r.slot);
  const [samples, setSamples] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (template?.slots ?? [newSlot(0)]).map((s) => [s.name, s.placeholder ?? "Maria"]),
    ),
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const setSlot = (i: number, patch: Partial<TemplateSlot>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, slot: { ...r.slot, ...patch } } : r)));
  const addSlot = () => {
    const key = nextKey.current++;
    setRows((rs) => [...rs, { key, slot: newSlot(rs.length) }]);
  };
  const removeSlot = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const w = Number(widthIn) || 1;
  const h = Number(heightIn) || 1;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.personalization.templates.key() });
  const input = () => ({
    name: name.trim(),
    widthIn: w,
    heightIn: h,
    backgroundKey: template?.backgroundKey ?? null,
    dpi: Number(dpi) || 300,
    slots,
  });
  const create = useMutation(
    orpc.personalization.templates.create.mutationOptions({
      onSuccess: (tp) => {
        toast.success(t("pers.created", "Template created"));
        void invalidate();
        void navigate({
          to: "/catalog/personalization/$templateId",
          params: { templateId: tp.id },
          replace: true,
        });
      },
    }),
  );
  const update = useMutation(
    orpc.personalization.templates.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("pers.saved", "Template saved"));
        void invalidate();
      },
    }),
  );
  const del = useMutation(
    orpc.personalization.templates.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t("pers.deleted", "Template deleted"));
        void invalidate();
        void navigate({ to: "/catalog/personalization" });
      },
    }),
  );
  const preview = useMutation(
    orpc.personalization.templates.preview.mutationOptions({
      meta: { errorTitle: t("pers.previewFailed", "Preview failed") },
    }),
  );
  const names = slots.map((s) => s.name);
  const valid =
    name.trim() &&
    w > 0 &&
    h > 0 &&
    slots.length > 0 &&
    new Set(names).size === names.length &&
    names.every(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {template ? template.name : t("pers.newTemplate", "New template")}
        </h1>
        {editable && (
          <div className="flex gap-2">
            {template && (
              <Button variant="ghost" className="text-danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                {t("action.delete")}
              </Button>
            )}
            <Button
              disabled={!valid || create.isPending || update.isPending}
              onClick={() =>
                template ? update.mutate({ id: template.id, ...input() }) : create.mutate(input())
              }
            >
              {(create.isPending || update.isPending) && <Loader2 className="animate-spin" />}
              {t("action.save")}
            </Button>
          </div>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Section title={t("pers.canvas", "Canvas")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={t("designs.name", "Name")} htmlFor="tp-name" className="col-span-2">
                <Input
                  id="tp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!editable}
                />
              </Field>
              <Field label={t("designs.widthIn", "Width (in)")} htmlFor="tp-w">
                <Input
                  id="tp-w"
                  type="number"
                  step="0.1"
                  value={widthIn}
                  onChange={(e) => setWidthIn(e.target.value)}
                  disabled={!editable}
                />
              </Field>
              <Field label={t("designs.heightIn", "Height (in)")} htmlFor="tp-h">
                <Input
                  id="tp-h"
                  type="number"
                  step="0.1"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  disabled={!editable}
                />
              </Field>
            </div>
          </Section>
          <Section
            title={t("pers.slots", "Text slots")}
            actions={
              editable && (
                <Button size="sm" variant="outline" onClick={addSlot}>
                  <Plus />
                  {t("pers.addSlot", "Add slot")}
                </Button>
              )
            }
          >
            <div className="flex flex-col gap-3">
              {rows.map(({ key, slot: s }, i) => (
                <fieldset
                  key={key}
                  disabled={!editable}
                  className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-6"
                >
                  <Field label={t("pers.slotName", "Slot name")} className="col-span-2">
                    <Input
                      value={s.name}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\s+/g, "_");
                        setSamples((prev) => ({ ...prev, [v]: prev[s.name] ?? "" }));
                        setSlot(i, { name: v });
                      }}
                    />
                  </Field>
                  <Field label={t("pers.kind", "Type")}>
                    <NativeSelect
                      value={s.kind}
                      onChange={(e) => setSlot(i, { kind: e.target.value as TemplateSlot["kind"] })}
                    >
                      <option value="text">{t("pers.kindText", "Text")}</option>
                      <option value="photo">{t("pers.kindPhoto", "Photo")}</option>
                    </NativeSelect>
                  </Field>
                  <Field label={t("pers.sourceQuestion", "Buyer question")}>
                    <Input
                      value={s.sourceQuestion ?? ""}
                      placeholder={t("pers.questionPh", "e.g. Name to print")}
                      onChange={(e) => setSlot(i, { sourceQuestion: e.target.value || null })}
                    />
                  </Field>
                  {s.kind === "text" && (
                    <Field label={t("pers.sample", "Sample text")} className="col-span-2">
                      <Input
                        value={samples[s.name] ?? ""}
                        onChange={(e) => setSamples({ ...samples, [s.name]: e.target.value })}
                      />
                    </Field>
                  )}
                  {(["xIn", "yIn", "wIn", "hIn"] as const).map((k) => (
                    <Field
                      key={k}
                      label={
                        {
                          xIn: "X (in)",
                          yIn: "Y (in)",
                          wIn: t("pers.w", "W (in)"),
                          hIn: t("pers.h", "H (in)"),
                        }[k]
                      }
                    >
                      <Input
                        type="number"
                        step="0.05"
                        value={s[k]}
                        onChange={(e) => setSlot(i, { [k]: Number(e.target.value) })}
                      />
                    </Field>
                  ))}
                  {s.kind === "photo" ? (
                    <Field label={t("pers.fit", "Fit")} className="col-span-2">
                      <NativeSelect
                        value={s.fit}
                        onChange={(e) => setSlot(i, { fit: e.target.value as TemplateSlot["fit"] })}
                      >
                        <option value="fit">
                          {t("pers.fitOption", "Fit (whole photo visible)")}
                        </option>
                        <option value="fill">{t("pers.fillOption", "Fill (crop to cover)")}</option>
                      </NativeSelect>
                    </Field>
                  ) : (
                    <>
                      <Field label={t("pers.font", "Font")} className="col-span-2">
                        <NativeSelect
                          value={s.fontFamily}
                          onChange={(e) =>
                            setSlot(i, { fontFamily: e.target.value as TemplateSlot["fontFamily"] })
                          }
                        >
                          {TEMPLATE_FONTS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label={t("pers.size", "Size (pt)")}>
                        <Input
                          type="number"
                          value={s.fontSizePt}
                          onChange={(e) => setSlot(i, { fontSizePt: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label={t("pers.minSize", "Min size (pt)")}>
                        <Input
                          type="number"
                          value={s.minFontSizePt ?? ""}
                          placeholder={t("pers.minSizePh", "60% default")}
                          onChange={(e) =>
                            setSlot(i, {
                              minFontSizePt: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </Field>
                      <Field label={t("pers.maxLines", "Max lines")}>
                        <Input
                          type="number"
                          value={s.maxLines ?? ""}
                          placeholder={t("pers.maxLinesPh", "Unlimited")}
                          onChange={(e) =>
                            setSlot(i, { maxLines: e.target.value ? Number(e.target.value) : null })
                          }
                        />
                      </Field>
                      <Field label={t("pers.color", "Color")}>
                        <Input
                          type="color"
                          className="p-1"
                          value={s.color}
                          onChange={(e) => setSlot(i, { color: e.target.value })}
                        />
                      </Field>
                      <Field label={t("pers.align", "Align")}>
                        <NativeSelect
                          value={s.align}
                          onChange={(e) =>
                            setSlot(i, { align: e.target.value as TemplateSlot["align"] })
                          }
                        >
                          <option value="left">{t("pers.left", "Left")}</option>
                          <option value="center">{t("pers.center", "Center")}</option>
                          <option value="right">{t("pers.right", "Right")}</option>
                        </NativeSelect>
                      </Field>
                      <Field label={t("pers.maxChars", "Max chars")}>
                        <Input
                          type="number"
                          value={s.maxChars ?? ""}
                          onChange={(e) =>
                            setSlot(i, {
                              maxChars: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </Field>
                      <Field label={t("pers.strokeWidth", "Outline width (pt)")}>
                        <Input
                          type="number"
                          value={s.strokeWidthPt}
                          onChange={(e) =>
                            setSlot(i, { strokeWidthPt: Number(e.target.value) || 0 })
                          }
                        />
                      </Field>
                      <Field label={t("pers.strokeColor", "Outline color")}>
                        <Input
                          type="color"
                          className="p-1"
                          value={s.strokeColor ?? "#ffffff"}
                          disabled={!s.strokeWidthPt}
                          onChange={(e) => setSlot(i, { strokeColor: e.target.value })}
                        />
                      </Field>
                      <label className="col-span-2 flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={s.uppercase}
                          onCheckedChange={(v) => setSlot(i, { uppercase: !!v })}
                        />
                        {t("pers.uppercase", "Uppercase")}
                      </label>
                    </>
                  )}
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={s.required}
                      onCheckedChange={(v) => setSlot(i, { required: !!v })}
                    />
                    {t("pers.required", "Required")}
                  </label>
                  {editable && slots.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="col-span-2 justify-self-end text-danger"
                      onClick={() => removeSlot(i)}
                    >
                      <Trash2 />
                      {t("pers.removeSlot", "Remove")}
                    </Button>
                  )}
                </fieldset>
              ))}
            </div>
          </Section>
        </div>
        <div className="flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start">
          <Section
            title={t("pers.livePreview", "Live preview")}
            description={t(
              "pers.livePreviewHint",
              "Approximate; render on the server for the exact print file",
            )}
          >
            <LivePreview widthIn={w} heightIn={h} slots={slots} values={samples} />
          </Section>
          {template && (
            <Section
              title={t("pers.serverPreview", "Print render")}
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => preview.mutate({ id: template.id, values: samples })}
                  disabled={preview.isPending}
                >
                  {preview.isPending ? <Loader2 className="animate-spin" /> : <Eye />}
                  {t("pers.render", "Render")}
                </Button>
              }
            >
              {preview.data ? (
                <div className="flex flex-col gap-2">
                  <div className="checkerboard overflow-hidden rounded-md">
                    <img
                      src={preview.data.previewUrl}
                      alt={t("pers.renderAlt", "Rendered personalization")}
                      className="w-full"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {preview.data.widthPx} × {preview.data.heightPx} px
                  </p>
                  {preview.data.flags.map((f) => (
                    <p key={`${f.slot}-${f.code}`} className="text-xs text-warning">
                      {f.slot ? `${f.slot}: ` : ""}
                      {f.message}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {template.slots.length !== slots.length || dirtyish(template, slots)
                    ? t(
                        "pers.saveFirst",
                        "Save the template, then render the sample values at print resolution.",
                      )
                    : t(
                        "pers.renderHint",
                        "Render the sample values at print resolution with the real fonts.",
                      )}
                </p>
              )}
            </Section>
          )}
        </div>
      </div>
      {template && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={t("pers.deleteTitle", "Delete {{name}}?", { name: template.name })}
          description={
            template.designCount > 0
              ? t("pers.inUse", "{{count}} designs still use this template.", {
                  count: template.designCount,
                })
              : undefined
          }
          destructive
          pending={del.isPending}
          onConfirm={() => del.mutate({ id: template.id })}
        />
      )}
    </div>
  );
}

function dirtyish(template: PersonalizationTemplate, slots: TemplateSlot[]) {
  return JSON.stringify(template.slots) !== JSON.stringify(slots);
}

function LivePreview({
  widthIn,
  heightIn,
  slots,
  values,
}: {
  widthIn: number;
  heightIn: number;
  slots: TemplateSlot[];
  values: Record<string, string>;
}) {
  const { t } = useTranslation();
  const fits = slots.map((s) => (s.kind === "photo" ? null : fitSlotText(s, values[s.name] ?? "")));
  return (
    <div className="flex flex-col gap-2">
      <div className="checkerboard overflow-hidden rounded-md border border-border">
        <svg
          viewBox={`0 0 ${widthIn} ${heightIn}`}
          className="block w-full"
          role="img"
          aria-label={t("pers.livePreview", "Live preview")}
        >
          <rect
            x={0}
            y={0}
            width={widthIn}
            height={heightIn}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.02}
            strokeDasharray="0.1 0.1"
            className="text-muted-foreground"
          />
          {slots.map((s, i) => {
            if (s.kind === "photo") {
              return (
                <g key={s.name}>
                  <rect
                    x={s.xIn}
                    y={s.yIn}
                    width={s.wIn}
                    height={s.hIn}
                    fill="currentColor"
                    className="fill-muted text-muted stroke-primary/60"
                    strokeWidth={0.03}
                  />
                  <text
                    x={s.xIn + s.wIn / 2}
                    y={s.yIn + s.hIn / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.min(s.wIn, s.hIn) * 0.18}
                    className="fill-muted-foreground"
                  >
                    {s.fit === "fill"
                      ? t("pers.fillOption", "Fill (crop to cover)")
                      : t("pers.fitOption", "Fit (whole photo visible)")}
                  </text>
                </g>
              );
            }
            const fit = fits[i];
            if (!fit) return null;
            const anchor = s.align === "left" ? "start" : s.align === "right" ? "end" : "middle";
            const x =
              s.align === "left" ? s.xIn : s.align === "right" ? s.xIn + s.wIn : s.xIn + s.wIn / 2;
            const lineHeightIn = (fit.fontSizePt / 72) * 1.2;
            const blockH = lineHeightIn * fit.lines.length;
            const y0 = s.yIn + s.hIn / 2 - blockH / 2 + lineHeightIn / 2;
            return (
              <g key={s.name}>
                <rect
                  x={s.xIn}
                  y={s.yIn}
                  width={s.wIn}
                  height={s.hIn}
                  fill="none"
                  strokeWidth={0.03}
                  className={fit.overflow || fit.tooLong ? "stroke-danger" : "stroke-primary/60"}
                />
                {fit.lines.map((line, li) => (
                  <text
                    // biome-ignore lint/suspicious/noArrayIndexKey: line order is stable per render
                    key={li}
                    x={x}
                    y={y0 + li * lineHeightIn}
                    textAnchor={anchor}
                    dominantBaseline="central"
                    fill={s.color}
                    stroke={s.strokeWidthPt ? (s.strokeColor ?? undefined) : undefined}
                    strokeWidth={s.strokeWidthPt ? s.strokeWidthPt / 72 : undefined}
                    paintOrder={s.strokeWidthPt ? "stroke" : undefined}
                    fontSize={fit.fontSizePt / 72}
                    fontFamily={s.fontFamily.replace(/ (Bold|Black)$/, "")}
                    fontWeight={
                      /Black/.test(s.fontFamily) ? 900 : /Bold/.test(s.fontFamily) ? 700 : 400
                    }
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="flex flex-wrap gap-2 text-xs">
        {slots.map((s, i) => {
          if (s.kind === "photo") {
            return (
              <li key={s.name}>
                <Badge variant="secondary">
                  {s.name}: {t("pers.kindPhoto", "Photo")}
                </Badge>
              </li>
            );
          }
          const fit = fits[i];
          if (!fit) return null;
          return (
            <li key={s.name}>
              <Badge
                variant={
                  fit.overflow || fit.tooLong ? "danger" : fit.scale < 1 ? "warning" : "secondary"
                }
              >
                {s.name}:{" "}
                {fit.overflow
                  ? t("pers.overflow", "overflow")
                  : fit.tooLong
                    ? t("pers.tooLong", "too long")
                    : `${Math.round(fit.scale * 100)}%`}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import {
  type Design,
  type DesignPlacement,
  PLACEMENTS,
  type Placement,
  type QaIssueCode,
} from "@invai/contracts";
import { Badge, Button, Checkbox, FileDrop, Input, Progress, Skeleton, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Camera,
  Loader2,
  Plus,
  ScanSearch,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { QA_TONE } from "../../../components/badges";
import { NicheChip } from "../../../components/market/niche-chip";
import { Field, NativeSelect, Section } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import {
  classifyRunFailure,
  mergeQa,
  type QaCode,
  qaActionErrorCode,
  type RunFailure,
  splitToast,
} from "../../../features/catalog/print-checks";
import { PlacementPreview, QaPanel } from "../../../features/catalog/qa-panel";
import { errorInfo, errorMessage } from "../../../lib/errors";
import { parseTags } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";
import { uploadFile } from "../../../lib/upload";

export const Route = createFileRoute("/_app/catalog/designs/$designId")({
  component: DesignEditorPage,
});

interface PlacementDraft {
  key: string;
  placement: Placement;
  fileKey: string;
  widthIn: string;
  heightIn: string;
  previewKey: string | null;
  localUrl: string | null;
  qa: DesignPlacement["qa"] | null;
  uploading: number | null;
}

function DesignEditorPage() {
  const { t } = useTranslation();
  const { designId } = Route.useParams();
  const isNew = designId === "new";
  const q = useQuery(orpc.designs.get.queryOptions({ input: { id: designId }, enabled: !isNew }));
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/catalog/designs">
          <ArrowLeft />
          {t("nav.designs")}
        </Link>
      </Button>
      {isNew ? (
        <DesignEditor design={null} />
      ) : q.isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <SkeletonRows rows={6} />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <DesignEditor key={q.data.updatedAt} design={q.data} />
      )}
    </div>
  );
}

function toDraft(p: DesignPlacement, i: number): PlacementDraft {
  return {
    key: `${p.placement}-${i}`,
    placement: p.placement,
    fileKey: p.fileKey,
    widthIn: String(p.widthIn),
    heightIn: String(p.heightIn),
    previewKey: p.previewKey,
    localUrl: null,
    qa: p.qa,
    uploading: null,
  };
}

function DesignEditor({ design }: { design: Design | null }) {
  const { t } = useTranslation();
  const can = useCan();
  const editable = can("catalog.manage");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(design?.code ?? "");
  const [name, setName] = useState(design?.name ?? "");
  const [tags, setTags] = useState(design?.tags.join(", ") ?? "");
  const [templateId, setTemplateId] = useState(design?.personalizationTemplateId ?? "");
  const [placements, setPlacements] = useState<PlacementDraft[]>(
    design?.placements.map(toDraft) ?? [
      {
        key: "front-0",
        placement: "front",
        fileKey: "",
        widthIn: "11",
        heightIn: "11",
        previewKey: null,
        localUrl: null,
        qa: null,
        uploading: null,
      },
    ],
  );
  const [cleanAlpha, setCleanAlpha] = useState(false);
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [runFailure, setRunFailure] = useState<RunFailure>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    key: string;
    code: QaCode;
    issue: string;
  } | null>(null);
  const templates = useQuery(
    orpc.personalization.templates.list.queryOptions({ input: { limit: 200 }, retry: false }),
  );

  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  useEffect(
    () => () => {
      for (const p of placementsRef.current) if (p.localUrl) URL.revokeObjectURL(p.localUrl);
    },
    [],
  );

  const update = (key: string, patch: Partial<PlacementDraft>) =>
    setPlacements((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function onFile(key: string, file: File) {
    const localUrl = URL.createObjectURL(file);
    update(key, { localUrl, uploading: 0 });
    // Suggest a print size from the pixel dimensions at 300 DPI.
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth / 300;
      const h = img.naturalHeight / 300;
      if (w > 0 && h > 0) update(key, { widthIn: w.toFixed(2), heightIn: h.toFixed(2) });
    };
    img.src = localUrl;
    try {
      const fileKey = await uploadFile("design", file, (r) => update(key, { uploading: r }));
      update(key, { fileKey, uploading: null, qa: null, previewKey: null });
    } catch (e) {
      update(key, { uploading: null });
      toast.error(t("designs.uploadFailed", "Upload failed"), { description: errorMessage(e) });
    }
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.designs.key() });
  const payload = () => ({
    code: code.trim(),
    name: name.trim(),
    tags: parseTags(tags),
    personalizationTemplateId: templateId || null,
    placements: placements.map((p) => ({
      placement: p.placement,
      fileKey: p.fileKey,
      widthIn: Number(p.widthIn),
      heightIn: Number(p.heightIn),
    })),
  });
  const create = useMutation(
    orpc.designs.create.mutationOptions({
      onSuccess: (d) => {
        toast.success(t("designs.created", "Design created; print QA is running"));
        void invalidate();
        void navigate({
          to: "/catalog/designs/$designId",
          params: { designId: d.id },
          replace: true,
        });
      },
    }),
  );
  const save = useMutation(
    orpc.designs.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("designs.saved", "Design saved"));
        void invalidate();
      },
    }),
  );
  const applyDesign = (d: Design) => setPlacements((ps) => mergeQa(ps, d));
  const runQa = useMutation(
    orpc.designs.runQa.mutationOptions({
      meta: { silent: true },
      onMutate: () => setRunFailure(null),
      onSuccess: (d) => {
        applyDesign(d);
        toast.success(
          t("designs.qaDone", "QA: {{status}}", { status: t(`qa.${d.qaStatus}`, d.qaStatus) }),
        );
        void invalidate();
      },
      onError: (e) => {
        const failure = classifyRunFailure(errorInfo(e));
        setRunFailure(failure);
        if (failure === "other") toast.error(errorMessage(e));
      },
    }),
  );
  const refetchDesign = async () => {
    if (!design) return;
    try {
      const fresh = await queryClient.fetchQuery(
        orpc.designs.get.queryOptions({ input: { id: design.id }, staleTime: 0 }),
      );
      applyDesign(fresh);
    } catch {
      void invalidate();
    }
  };
  const unaccept = useMutation(
    orpc.designs.unacceptQaWarning.mutationOptions({ meta: { silent: true } }),
  );
  const accept = useMutation(
    orpc.designs.acceptQaWarning.mutationOptions({ meta: { silent: true } }),
  );
  async function changeAcceptance(
    kind: "accept" | "unaccept",
    p: PlacementDraft,
    code: QaIssueCode,
  ) {
    if (!design) return;
    setBusyAction(`${kind}:${code}`);
    setActionError(null);
    try {
      const input = { id: design.id, placement: p.placement, code };
      const d = await (kind === "accept" ? accept : unaccept).mutateAsync(input);
      applyDesign(d);
      void invalidate();
      if (kind === "accept") {
        const parts = splitToast(t("qa.acceptedToast", "Warning accepted. Undo"));
        toast.success(parts.message, {
          duration: 8000,
          action: {
            label: parts.action,
            onClick: () => void changeAcceptance("unaccept", p, code),
          },
        });
      }
    } catch (e) {
      const known = qaActionErrorCode(errorInfo(e));
      if (known) setActionError({ key: p.key, code: known, issue: code });
      else toast.error(errorMessage(e));
      await refetchDesign();
    } finally {
      setBusyAction(null);
    }
  }
  const archive = useMutation(
    (design?.status === "archived" ? orpc.designs.unarchive : orpc.designs.archive).mutationOptions(
      {
        onSuccess: () => {
          void invalidate();
          toast.success(
            design?.status === "archived"
              ? t("designs.restored", "Design restored")
              : t("designs.archivedToast", "Design archived"),
          );
        },
      },
    ),
  );

  const uploading = placements.some((p) => p.uploading !== null);
  const valid =
    code.trim() &&
    name.trim() &&
    placements.length > 0 &&
    placements.every((p) => p.fileKey && Number(p.widthIn) > 0 && Number(p.heightIn) > 0);
  const pending = create.isPending || save.isPending;
  const usedPlacements = new Set(placements.map((p) => p.placement));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {design ? design.name : t("designs.new", "New design")}
          </h1>
          {design && (
            <Badge variant={QA_TONE[design.qaStatus]}>
              {t("designs.qa", "QA")}: {t(`qa.${design.qaStatus}`, design.qaStatus)}
            </Badge>
          )}
          {design?.status === "archived" && (
            <Badge variant="outline">{t("designs.archived", "Archived")}</Badge>
          )}
        </div>
        {design && (
          <div className="flex flex-wrap gap-2">
            {can("ai.listings.manage") && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/listings/drafts" search={{ designId: design.id, create: true }}>
                  <Sparkles />
                  {t("designs.draftListing", "Draft listings")}
                </Link>
              </Button>
            )}
            {can("photos.read") && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/listing-photos" search={{ designId: design.id }}>
                  <Camera />
                  {t("designs.listingPhotos", "Listing photos")}
                </Link>
              </Button>
            )}
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => archive.mutate({ id: design.id })}
                disabled={archive.isPending}
              >
                {design.status === "archived" ? <ArchiveRestore /> : <Archive />}
                {design.status === "archived"
                  ? t("designs.unarchive", "Restore")
                  : t("designs.archive", "Archive")}
              </Button>
            )}
          </div>
        )}
      </div>
      {design && <NicheChip designId={design.id} canManage={can("market.niches.manage")} />}
      <Section title={t("designs.details", "Details")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("designs.code", "SKU code")}
            htmlFor="code"
            hint={t("designs.codeHint", "Short code used in SKUs, e.g. D1042")}
          >
            <Input
              id="code"
              value={code}
              maxLength={32}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!editable}
            />
          </Field>
          <Field label={t("designs.name", "Name")} htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field
            label={t("designs.tags", "Tags")}
            htmlFor="tags"
            hint={t("designs.tagsHint", "Comma separated")}
          >
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label={t("designs.template", "Personalization template")} htmlFor="template">
            <NativeSelect
              id="template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={!editable}
            >
              <option value="">{t("designs.noTemplate", "None (not personalized)")}</option>
              {templates.data?.items.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {design?.ocrText && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("designs.ocr", "Text found in the artwork")}:{" "}
            <span className="text-foreground">{design.ocrText}</span>
          </p>
        )}
      </Section>
      <Section
        title={t("designs.placementsTitle", "Placements and print files")}
        actions={
          editable &&
          usedPlacements.size < PLACEMENTS.length && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = PLACEMENTS.find((p) => !usedPlacements.has(p)) ?? "back";
                setPlacements((ps) => [
                  ...ps,
                  {
                    key: `${next}-${Date.now()}`,
                    placement: next,
                    fileKey: "",
                    widthIn: "11",
                    heightIn: "11",
                    previewKey: null,
                    localUrl: null,
                    qa: null,
                    uploading: null,
                  },
                ]);
              }}
            >
              <Plus />
              {t("designs.addPlacement", "Add placement")}
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-4">
          {placements.map((p) => (
            <div
              key={p.key}
              className="grid gap-4 rounded-md border border-border p-3 md:grid-cols-[12rem_1fr]"
            >
              <div className="flex flex-col gap-2">
                {p.localUrl ? (
                  <div className="checkerboard aspect-square overflow-hidden rounded-md">
                    <img src={p.localUrl} alt="" className="size-full object-contain" />
                  </div>
                ) : (
                  <PlacementPreview
                    fileKey={p.previewKey ?? (p.fileKey || null)}
                    alt={t(`placement.${p.placement}`, p.placement.replace(/_/g, " "))}
                    regions={(p.qa?.issues ?? [])
                      .filter((i) => shown.has(`${p.key}:${i.code}`))
                      .map((i) => i.regions)}
                  />
                )}
                {p.uploading !== null && <Progress value={p.uploading * 100} className="h-1.5" />}
              </div>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field
                    label={t("orders.placement", "Placement")}
                    className="col-span-2 sm:col-span-1"
                  >
                    <NativeSelect
                      value={p.placement}
                      onChange={(e) => update(p.key, { placement: e.target.value as Placement })}
                      disabled={!editable}
                    >
                      {PLACEMENTS.map((pl) => (
                        <option
                          key={pl}
                          value={pl}
                          disabled={pl !== p.placement && usedPlacements.has(pl)}
                        >
                          {t(`placement.${pl}`, pl.replace(/_/g, " "))}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={t("designs.widthIn", "Width (in)")}>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={p.widthIn}
                      onChange={(e) => update(p.key, { widthIn: e.target.value })}
                      disabled={!editable}
                    />
                  </Field>
                  <Field label={t("designs.heightIn", "Height (in)")}>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={p.heightIn}
                      onChange={(e) => update(p.key, { heightIn: e.target.value })}
                      disabled={!editable}
                    />
                  </Field>
                </div>
                {editable && (
                  <FileDrop
                    accept="image/png,image/svg+xml,application/pdf"
                    onFiles={(files) => files[0] && void onFile(p.key, files[0])}
                    disabled={p.uploading !== null}
                    label={
                      p.fileKey
                        ? t("designs.replaceFile", "Drop a new print file to replace")
                        : t("designs.dropFile", "Drop the print file (PNG, SVG or PDF)")
                    }
                    hint={t("designs.fileHint", "Transparent PNG at 300 DPI prints best")}
                    className="py-5"
                  />
                )}
                {p.qa && (
                  <QaPanel
                    qa={p.qa}
                    checking={runQa.isPending || p.uploading !== null}
                    failure={runFailure}
                    canManage={editable}
                    shown={
                      new Set(
                        [...shown]
                          .filter((k) => k.startsWith(`${p.key}:`))
                          .map((k) => k.slice(p.key.length + 1)),
                      )
                    }
                    onToggleShown={(code) =>
                      setShown((cur) => {
                        const next = new Set(cur);
                        const k = `${p.key}:${code}`;
                        if (!next.delete(k)) next.add(k);
                        return next;
                      })
                    }
                    onAccept={(code) => void changeAcceptance("accept", p, code)}
                    onUnaccept={(code) => void changeAcceptance("unaccept", p, code)}
                    onRetry={() => design && runQa.mutate({ id: design.id, cleanAlpha })}
                    busyAction={busyAction}
                    actionError={actionError?.key === p.key ? actionError : null}
                  />
                )}
                {editable && placements.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-danger"
                    onClick={() => setPlacements((ps) => ps.filter((x) => x.key !== p.key))}
                  >
                    <Trash2 />
                    {t("designs.removePlacement", "Remove placement")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
      {editable && (
        <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          {design && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={cleanAlpha} onCheckedChange={(v) => setCleanAlpha(!!v)} />
                {t("designs.cleanAlpha", "Clean soft transparency")}
              </label>
              <Button
                variant="outline"
                onClick={() => runQa.mutate({ id: design.id, cleanAlpha })}
                disabled={runQa.isPending}
              >
                {runQa.isPending ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                {t("designs.runQa", "Run QA")}
              </Button>
            </>
          )}
          <Button
            disabled={!valid || uploading || pending}
            onClick={() =>
              design ? save.mutate({ id: design.id, ...payload() }) : create.mutate(payload())
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {design ? t("action.save") : t("designs.create", "Create design")}
          </Button>
        </div>
      )}
    </div>
  );
}

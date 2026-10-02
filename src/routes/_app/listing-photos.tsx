import type {
  BlankColor,
  Design,
  DesignPhotoAnalysis,
  GarmentType,
  PhotoChannel,
  PhotoChecks,
  PhotoImage,
  PhotoSetSpec,
} from "@invai/contracts";
import { PHOTO_CHANNELS } from "@invai/contracts";
import {
  Badge,
  Button,
  ChannelBadge,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  RelativeTime,
  toast,
} from "@invai/ui";
import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  Loader2,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Section } from "../../components/page";
import { SignedImage } from "../../components/signed-image";
import { ErrorState, SkeletonRows } from "../../components/states";
import {
  ALL_GARMENTS,
  ALL_VIEWS,
  checkFailureMessage,
  contrastWarningMessage,
  garmentLabel,
  photoErrorMessage,
  skipReasonLabel,
  type TemplateView,
  viewLabel,
} from "../../features/listing-photos/labels";
import { useDebounced } from "../../hooks/use-debounced";
import { useInView } from "../../hooks/use-in-view";
import { useCan } from "../../lib/me";
import { orpc } from "../../lib/rpc";

/** Signed URLs live ~15 minutes (`SignedImage`); swap a bit before they actually expire. */
const SIGNED_URL_REFRESH_MS = 13 * 60_000;

/**
 * `getSet` re-presigns every image's URL on each poll (a fresh `X-Amz-Date`), so using
 * `image.url` directly as `<img src>` re-downloads every rendered photo on every 2.5 s poll or
 * realtime refresh (round-2 finding R3). Reuse the previous URL for an image's stable S3 `key`
 * until it nears its expiry or the key itself changes.
 */
function useStableImageUrls(images: PhotoImage[]): PhotoImage[] {
  const cache = useRef(new Map<string, { key: string | null; url: string; at: number }>());
  const now = Date.now();
  return images.map((img) => {
    if (!img.url) return img;
    const cached = cache.current.get(img.id);
    if (cached && cached.key === img.key && now - cached.at < SIGNED_URL_REFRESH_MS) {
      return cached.url === img.url ? img : { ...img, url: cached.url };
    }
    cache.current.set(img.id, { key: img.key, url: img.url, at: now });
    return img;
  });
}

export const Route = createFileRoute("/_app/listing-photos")({
  validateSearch: z.object({
    designId: z.string().optional().catch(undefined),
    setId: z.string().optional().catch(undefined),
  }),
  component: ListingPhotosPage,
});

interface PhotoSetListItem {
  id: string;
  designName: string;
  updatedAt: string;
}
type SetsQuery = UseInfiniteQueryResult<InfiniteData<{ items: PhotoSetListItem[] }>>;

function ListingPhotosPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/listing-photos" });
  const sets = useInfiniteQuery(
    orpc.photos.listSets.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 20 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );

  return (
    <Section
      title={t("photos.title", "Listing photos")}
      description={t(
        "photos.subtitle",
        "Create marketplace-ready product photos from a design, check each one, then download or attach them to a listing.",
      )}
    >
      {sets.isError ? (
        <ErrorState error={sets.error} onRetry={() => void sets.refetch()} />
      ) : search.setId ? (
        <SetDetail setId={search.setId} />
      ) : (
        <div className="flex flex-col gap-6">
          {search.designId ? (
            <DesignFlow
              key={search.designId}
              designId={search.designId}
              onChangeDesign={() => void navigate({ search: {} })}
              onCreated={(setId) => void navigate({ search: { setId } })}
            />
          ) : (
            <PickDesign onSelect={(designId) => void navigate({ search: { designId } })} />
          )}
          <RecentSets query={sets} />
        </div>
      )}
    </Section>
  );
}

function PickDesign({ onSelect }: { onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const designs = useInfiniteQuery(
    orpc.designs.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        search: q || undefined,
        status: "active",
        cursor,
        limit: 30,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  // Photos need a front or back print file (AC7, schema `no_print_file`); a design with only a
  // chest/sleeve placement can't be analyzed, so it never appears here -- it shows in the
  // ordinary design list instead.
  const items = useMemo(
    () =>
      (designs.data?.pages.flatMap((p) => p.items) ?? []).filter((d) =>
        d.placements.some((p) => p.placement === "front" || p.placement === "back"),
      ),
    [designs.data],
  );
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("photos.pickDesign", "Pick a design")}</h2>
      <Input
        type="search"
        aria-label={t("photos.searchDesigns", "Search designs")}
        placeholder={t("photos.searchDesigns", "Search designs")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="max-w-sm"
      />
      {designs.isPending ? (
        <SkeletonRows rows={4} />
      ) : designs.isError ? (
        <ErrorState error={designs.error} onRetry={() => void designs.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((d) => (
            <PickDesignCard key={d.id} design={d} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The grid can hold the whole first page of designs at once; lazy-mount each thumbnail's
 * `SignedImage` only once it is near the viewport (round-2 finding R3, same pattern as
 * `catalog/designs.index.tsx`), instead of presigning all 30 the instant the page loads.
 */
function PickDesignCard({ design, onSelect }: { design: Design; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const { ref, inView } = useInView();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
      {inView ? (
        <SignedImage
          fileKey={design.placements[0]?.previewKey ?? null}
          alt={design.name}
          className="aspect-square w-full"
        />
      ) : (
        <div
          ref={ref}
          aria-hidden
          className="checkerboard aspect-square w-full rounded-md bg-muted"
        />
      )}
      <span className="truncate text-sm font-medium">{design.name}</span>
      <Button size="sm" variant="outline" onClick={() => onSelect(design.id)}>
        {t("photos.select", "Select {{name}}", { name: design.name })}
      </Button>
    </div>
  );
}

function RecentSets({ query }: { query: SetsQuery }) {
  const { t } = useTranslation();
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-semibold">{t("photos.recentSets", "Recent sets")}</h2>
      {query.isPending ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("photos.noSets", "No photo sets yet")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <Link
                to="/listing-photos"
                search={{ setId: s.id }}
                className="text-primary hover:underline"
              >
                {t("photos.open", "Open {{name}}", { name: s.designName })}
              </Link>
              <RelativeTime value={s.updatedAt} className="text-xs text-muted-foreground" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DesignFlow({
  designId,
  onChangeDesign,
  onCreated,
}: {
  designId: string;
  onChangeDesign: () => void;
  onCreated: (setId: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const design = useQuery(orpc.designs.get.queryOptions({ input: { id: designId } }));
  const lastJobId = useRef<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const analysis = useQuery(
    orpc.photos.analyzeDesign.queryOptions({
      input: { designId, refresh: false },
      refetchInterval: (query) =>
        query.state.data?.status === "pending" && !stalled ? 2000 : false,
    }),
  );
  // The backend answers a failed analysis job by silently re-enqueuing a new one and still
  // returning `pending` (R1; the semantics fix is queued for wave 27), so `status: "failed"`
  // never actually arrives. A `pending` jobId that differs from the one we started polling means
  // the previous job failed: stop polling instead of re-running imaging + AI every 2 s forever.
  useEffect(() => {
    const d = analysis.data;
    if (d?.status !== "pending") return;
    if (lastJobId.current === null) lastJobId.current = d.jobId;
    else if (d.jobId !== lastJobId.current) setStalled(true);
  }, [analysis.data]);
  const refresh = useMutation(
    orpc.photos.analyzeDesign.mutationOptions({
      onSuccess: (result) => {
        lastJobId.current = result.status === "pending" ? result.jobId : null;
        setStalled(false);
        void queryClient.invalidateQueries({ queryKey: orpc.photos.key() });
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {design.data && (
            <SignedImage
              fileKey={design.data.placements[0]?.previewKey ?? null}
              alt={design.data.name}
              className="size-10"
            />
          )}
          <h2 className="text-lg font-semibold">{design.data?.name ?? "…"}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onChangeDesign}>
          {t("photos.changeDesign", "Change design")}
        </Button>
      </div>
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">{t("photos.analysisTitle", "Analysis")}</h3>
        {analysis.isPending || (analysis.data?.status === "pending" && !stalled) ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("photos.analyzing", "Analyzing design…")}
          </p>
        ) : analysis.isError ? (
          <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} compact />
        ) : stalled || analysis.data?.status === "failed" ? (
          <ErrorState
            error={{
              code: "PHOTO_ANALYSIS_FAILED",
              message: t("photos.analysisFailed", "We couldn't analyze this design. Try again."),
            }}
            onRetry={() => refresh.mutate({ designId, refresh: true })}
            compact
          />
        ) : analysis.data?.status === "ready" ? (
          <AnalysisPanel analysis={analysis.data.analysis} />
        ) : null}
      </div>
      {analysis.data?.status === "ready" && !stalled && (
        <ChoosePanel
          designId={designId}
          design={design.data ?? null}
          analysis={analysis.data.analysis}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: DesignPhotoAnalysis }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      {analysis.source === "mock" && (
        <Badge variant="secondary" className="self-start">
          {t("photos.sampleAnalysis", "Sample analysis")}
        </Badge>
      )}
      <p className="text-sm">{analysis.style}</p>
      <p className="text-sm text-muted-foreground">{analysis.audience}</p>
      {analysis.detectedText && (
        <p className="text-xs text-muted-foreground">
          {t("photos.detectedText", "Text in the artwork")}: {analysis.detectedText}
        </p>
      )}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">
          {t("photos.recommendedColors", "Recommended colors")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {analysis.recommendedColors.map((c) => (
            <span
              key={c.hex}
              title={c.reason}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs"
            >
              <span
                aria-hidden
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: c.hex }}
              />
              {c.name}
            </span>
          ))}
        </div>
      </div>
      {analysis.contrastWarnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {analysis.contrastWarnings.map((w) => (
            <p key={`${w.kind}-${w.blank.hex}`} className="text-xs text-warning">
              {contrastWarningMessage(t, w)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ChoosePanel({
  designId,
  design,
  analysis,
  onCreated,
}: {
  designId: string;
  design: Design | null;
  analysis: DesignPhotoAnalysis;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [garments, setGarments] = useState<Set<GarmentType>>(new Set());
  const [colorKeys, setColorKeys] = useState<Set<string>>(new Set());
  const [views, setViews] = useState<Set<TemplateView>>(new Set());
  const [channels, setChannels] = useState<Set<PhotoChannel>>(new Set());
  const facets = useQuery(orpc.blanks.facets.queryOptions({ input: {}, staleTime: 5 * 60_000 }));

  // Keyed by the color's name, not its hex: two blank styles can share a color name ("White")
  // with slightly different hex values, and the shop thinks of that as one color, not two
  // checkboxes with the same accessible name.
  const colorOptions = useMemo(() => {
    const map = new Map<
      string,
      { key: string; hex: string; name: string; recommended: boolean; reason?: string }
    >();
    for (const c of facets.data?.colors ?? []) {
      if (c.colorHex && /^#[0-9a-fA-F]{6}$/.test(c.colorHex)) {
        const name = c.color || c.colorCode;
        const key = name.trim().toLowerCase();
        if (!map.has(key))
          map.set(key, { key, hex: c.colorHex.toLowerCase(), name, recommended: false });
      }
    }
    for (const c of analysis.recommendedColors) {
      const key = c.name.trim().toLowerCase();
      map.set(key, {
        key,
        hex: c.hex.toLowerCase(),
        name: c.name,
        recommended: true,
        reason: c.reason,
      });
    }
    return [...map.values()];
  }, [facets.data, analysis.recommendedColors]);
  const colorByKey = useMemo(
    () =>
      new Map(colorOptions.map((c): [string, BlankColor] => [c.key, { name: c.name, hex: c.hex }])),
    [colorOptions],
  );
  const hasBackPrint = design?.placements.some((p) => p.placement === "back") ?? false;

  const spec: PhotoSetSpec | null = useMemo(() => {
    if (garments.size === 0 || colorKeys.size === 0 || views.size === 0 || channels.size === 0)
      return null;
    return {
      designId,
      garments: [...garments],
      colors: [...colorKeys].flatMap((k) => {
        const c = colorByKey.get(k);
        return c ? [c] : [];
      }),
      views: [...views],
      channels: [...channels],
      underbasePreview: true,
    };
  }, [designId, garments, colorKeys, views, channels, colorByKey]);
  const specForQuery: PhotoSetSpec = spec ?? {
    designId,
    garments: [],
    colors: [],
    views: [],
    channels: [],
    underbasePreview: true,
  };
  const estimate = useQuery(
    orpc.photos.estimate.queryOptions({ input: specForQuery, enabled: !!spec }),
  );

  const specKey = spec ? JSON.stringify(spec) : "";
  const idemRef = useRef({ key: crypto.randomUUID(), forSpec: specKey });
  if (idemRef.current.forSpec !== specKey)
    idemRef.current = { key: crypto.randomUUID(), forSpec: specKey };

  const createSet = useMutation(
    orpc.photos.createSet.mutationOptions({
      onSuccess: (set) => onCreated(set.id),
      onError: (err) => toast.error(photoErrorMessage(t, err)),
    }),
  );

  function toggle<T>(set: Set<T>, setSet: (s: Set<T>) => void, v: T, on: boolean) {
    const n = new Set(set);
    if (on) n.add(v);
    else n.delete(v);
    setSet(n);
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">
        {t("photos.chooseTitle", "Choose garments, colors, views and channels")}
      </h3>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("photos.garments", "Garments")}</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_GARMENTS.map((g) => (
            <label
              key={g}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
            >
              <Checkbox
                checked={garments.has(g)}
                onCheckedChange={(v) => toggle(garments, setGarments, g, !!v)}
              />
              {garmentLabel(t, g)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("photos.colors", "Blank colors")}</legend>
        <div className="flex flex-wrap gap-2">
          {colorOptions.map((c) => (
            <label
              key={c.key}
              title={c.reason}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
            >
              <Checkbox
                checked={colorKeys.has(c.key)}
                onCheckedChange={(v) => toggle(colorKeys, setColorKeys, c.key, !!v)}
              />
              <span
                aria-hidden
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: c.hex }}
              />
              {c.name}
              {c.recommended && <Sparkles className="size-3 text-info" aria-hidden />}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("photos.views", "Views")}</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_VIEWS.map((v) => (
            <label
              key={v}
              title={
                v === "back" && !hasBackPrint
                  ? t("photos.noBackPrint", "No back print file")
                  : undefined
              }
              className={cn(
                "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm",
                v === "back" && !hasBackPrint && "opacity-50",
              )}
            >
              <Checkbox
                checked={views.has(v)}
                disabled={v === "back" && !hasBackPrint}
                onCheckedChange={(on) => toggle(views, setViews, v, !!on)}
              />
              {viewLabel(t, v)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("photos.channels", "Channels")}</legend>
        <div className="flex flex-wrap gap-2">
          {PHOTO_CHANNELS.map((c) => (
            <label
              key={c}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm"
            >
              <Checkbox
                checked={channels.has(c)}
                onCheckedChange={(on) => toggle(channels, setChannels, c, !!on)}
              />
              {t(`channel.${c}`, c)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        {estimate.data && (
          <span className="text-sm font-medium">
            {t("photos.estimateSummary", "{{images}} photos, {{credits}} credits", {
              images: estimate.data.images,
              credits: estimate.data.credits,
            })}
          </span>
        )}
        {estimate.isError && <ErrorState error={estimate.error} compact />}
        <Button
          disabled={!spec || !estimate.data?.canAfford || createSet.isPending}
          onClick={() => spec && createSet.mutate({ ...spec, idempotencyKey: idemRef.current.key })}
        >
          {createSet.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Sparkles aria-hidden />
          )}
          {t("photos.generate", "Generate")}
        </Button>
      </div>
      {estimate.data && !estimate.data.canAfford && (
        <p className="text-sm text-muted-foreground">
          {t("photos.creditsShort", "Needs {{credits}} credits; you have {{remaining}}.", {
            credits: estimate.data.credits,
            remaining: estimate.data.creditsRemaining,
          })}
        </p>
      )}
      {estimate.data && estimate.data.skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("photos.skippedCount", "{{count}} combination(s) skipped: {{reasons}}", {
            count: estimate.data.skipped.length,
            reasons: [
              ...new Set(estimate.data.skipped.map((s) => skipReasonLabel(t, s.reason))),
            ].join(", "),
          })}
        </p>
      )}
    </div>
  );
}

function SetDetail({ setId }: { setId: string }) {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const q = useQuery(
    orpc.photos.getSet.queryOptions({
      input: { id: setId },
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return false;
        const rendering = d.status === "queued" || d.status === "rendering";
        const zipBusy = d.zip.status === "queued" || d.zip.status === "building";
        return rendering || zipBusy ? 2500 : false;
      },
    }),
  );
  const reviewImages = useMutation(
    orpc.photos.reviewImages.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.photos.key() }),
      onError: (err) => toast.error(photoErrorMessage(t, err)),
    }),
  );
  const exportZip = useMutation(
    orpc.photos.exportZip.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.photos.key() }),
    }),
  );
  // Keyed on the sorted set of approved image ids, not the count (R2): approving one image and
  // rejecting another leaves the count unchanged but must still rebuild the zip. `lastZipKey` is
  // read (for the "does the ready zip match now" check) before it's updated for this render, so a
  // just-detected mismatch never shows the stale `Download` link for the old approved set.
  const lastZipKey = useRef<string | null>(null);
  const images = useStableImageUrls(q.data?.images ?? []);

  if (q.isPending) return <SkeletonRows rows={10} />;
  if (q.isError)
    return (
      <ErrorState
        error={{ code: "PHOTO_SET_ERROR", message: photoErrorMessage(t, q.error) }}
        onRetry={() => void q.refetch()}
      />
    );
  const set = q.data;
  const approvedIds = images.filter((i) => i.status === "approved").map((i) => i.id);
  const passingRenderedIds = images
    .filter((i) => i.status === "rendered" && (!i.checks || i.checks.passes))
    .map((i) => i.id);
  const approvedKey = [...approvedIds].sort().join(",");
  const zipMatchesApproved = lastZipKey.current === approvedKey && !exportZip.isPending;
  if (
    approvedKey &&
    approvedKey !== lastZipKey.current &&
    set.zip.status !== "queued" &&
    set.zip.status !== "building"
  ) {
    lastZipKey.current = approvedKey;
    exportZip.mutate({ setId });
  }
  const byChannel = new Map<string, PhotoImage[]>();
  for (const img of images) {
    const arr = byChannel.get(img.channel) ?? [];
    arr.push(img);
    byChannel.set(img.channel, arr);
  }
  for (const arr of byChannel.values()) arr.sort((a, b) => a.slot - b.slot);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/listing-photos" search={{}}>
            <ArrowLeft aria-hidden />
            {t("photos.title", "Listing photos")}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {can("photos.manage") && passingRenderedIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={reviewImages.isPending}
              onClick={() => reviewImages.mutate({ setId, approve: passingRenderedIds })}
            >
              <Check aria-hidden />
              {t("photos.approveAllPassing", "Approve all passing")}
            </Button>
          )}
          {set.zip.status === "ready" && set.zip.url && zipMatchesApproved ? (
            <Button asChild size="sm">
              <a href={set.zip.url} target="_blank" rel="noopener noreferrer">
                <Download aria-hidden />
                {t("photos.downloadZip", "Download zip")}
              </a>
            </Button>
          ) : set.zip.status === "failed" || exportZip.isError ? (
            <Button variant="outline" size="sm" onClick={() => exportZip.mutate({ setId })}>
              <RotateCw aria-hidden />
              {t("photos.zipFailed", "Couldn't build the zip. Try again.")}
            </Button>
          ) : approvedIds.length > 0 ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="animate-spin" aria-hidden />
              {t("photos.buildingZip", "Building zip…")}
            </Button>
          ) : null}
          {can("photos.manage") && (
            <AttachButton
              setId={setId}
              designId={set.designId}
              approvedIds={approvedIds}
              disabled={approvedIds.length === 0}
            />
          )}
        </div>
      </div>
      <h2 className="text-lg font-semibold">{set.designName}</h2>
      {images.length > 0 && approvedIds.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t(
            "photos.needsApproval",
            "These photos still need approval before you can download or attach them.",
          )}
        </p>
      )}
      {[...byChannel.entries()].map(([channel, channelImages]) => (
        <Section key={channel} title={t(`channel.${channel}`, channel)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {channelImages.map((img) => (
              <ImageCard
                key={img.id}
                image={img}
                canManage={can("photos.manage")}
                reviewPending={reviewImages.isPending}
                onReview={(approve) =>
                  reviewImages.mutate(
                    approve ? { setId, approve: [img.id] } : { setId, reject: [img.id] },
                  )
                }
              />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function ImageCard({
  image,
  canManage,
  reviewPending,
  onReview,
}: {
  image: PhotoImage;
  canManage: boolean;
  reviewPending: boolean;
  onReview: (approve: boolean) => void;
}) {
  const { t } = useTranslation();
  const checks: PhotoChecks | null = image.checks;
  const errors = checks?.failures.filter((f) => f.severity === "error") ?? [];
  const warns = checks?.failures.filter((f) => f.severity === "warn") ?? [];
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
      <div className="checkerboard flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
        {image.url ? (
          <img
            src={image.url}
            alt={image.altText ?? ""}
            className="size-full object-contain"
            loading="lazy"
          />
        ) : image.status === "failed" ? (
          <AlertTriangle className="size-6 text-danger" aria-hidden />
        ) : (
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {garmentLabel(t, image.garment)} · {image.color.name}
      </span>
      {image.status === "queued" && (
        <Badge variant="secondary">{t("photos.queued", "Queued")}</Badge>
      )}
      {image.status === "rendering" && (
        <Badge variant="secondary">{t("photos.rendering", "Rendering")}</Badge>
      )}
      {image.status === "failed" && (
        <Badge variant="danger">{t("photos.imageFailed", "This photo couldn't be made.")}</Badge>
      )}
      {checks &&
        (checks.passes ? (
          <Badge variant="success">{t("photos.pass", "Pass")}</Badge>
        ) : (
          errors.map((f) => (
            <p key={f.code} className="text-xs text-danger">
              {checkFailureMessage(t, f, image)}
            </p>
          ))
        ))}
      {warns.map((f) => (
        <p key={f.code} className="text-xs text-warning">
          {checkFailureMessage(t, f, image)}
        </p>
      ))}
      {image.status === "approved" && (
        <Badge variant="success">{t("photos.approved", "Approved")}</Badge>
      )}
      {image.status === "rejected" && (
        <Badge variant="outline">{t("photos.rejected", "Rejected")}</Badge>
      )}
      {canManage &&
        (image.status === "rendered" ||
          image.status === "approved" ||
          image.status === "rejected") && (
          <div className="mt-1 flex gap-1.5">
            {image.status !== "approved" && (
              <Button
                size="sm"
                variant="outline"
                disabled={reviewPending}
                onClick={() => onReview(true)}
              >
                {t("photos.approve", "Approve")}
              </Button>
            )}
            {image.status !== "rejected" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={reviewPending}
                onClick={() => onReview(false)}
              >
                {t("photos.reject", "Reject")}
              </Button>
            )}
          </div>
        )}
    </div>
  );
}

function AttachButton({
  setId,
  designId,
  approvedIds,
  disabled,
}: {
  setId: string;
  designId: string;
  approvedIds: string[];
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const drafts = useQuery(
    orpc.ai.listings.list.queryOptions({ input: { designId, limit: 50 }, enabled: open }),
  );
  const attach = useMutation(
    orpc.photos.attachToDraft.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          t("photos.attached", "Attached {{count}} photos to the draft", { count: res.attached }),
        );
        setOpen(false);
        setDraftId(null);
      },
      onError: (err) => toast.error(photoErrorMessage(t, err)),
    }),
  );
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-auto whitespace-normal text-left"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Sparkles aria-hidden />
        {t("photos.attachToDraft", "Attach to AI listing draft")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("photos.attachDialogTitle", "Attach to a listing draft")}</DialogTitle>
            <DialogDescription>
              {t("photos.attachDialogHint", "Pick a draft of the same design.")}
            </DialogDescription>
          </DialogHeader>
          {drafts.isPending ? (
            <Loader2 className="mx-auto my-4 animate-spin" aria-hidden />
          ) : drafts.data && drafts.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("photos.noDraftsForDesign", "No AI listing drafts for this design yet.")}
            </p>
          ) : (
            <div
              role="listbox"
              aria-label={t("photos.attachDialogTitle", "Attach to a listing draft")}
              className="flex max-h-64 flex-col gap-1 overflow-y-auto"
            >
              {drafts.data?.items.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="option"
                  aria-selected={draftId === d.id}
                  onClick={() => setDraftId(d.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-sm",
                    draftId === d.id && "border-primary bg-accent",
                  )}
                >
                  <span className="truncate">
                    {d.content.title || t(`channel.${d.channel}`, d.channel)}
                  </span>
                  <ChannelBadge channel={d.channel} />
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              disabled={!draftId || attach.isPending}
              onClick={() => draftId && attach.mutate({ setId, draftId, imageIds: approvedIds })}
            >
              {attach.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {t("photos.attachButton", "Attach")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

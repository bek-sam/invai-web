import { CHANNEL_RULES, type ListingContent, type ListingDraft } from "@invai/contracts";
import {
  Badge,
  Button,
  ChannelBadge,
  cn,
  Input,
  RelativeTime,
  Skeleton,
  Textarea,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Copy, Loader2, RefreshCw, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Field, NativeSelect, Section } from "../../../components/page";
import { SignedImage } from "../../../components/signed-image";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { DraftStatusBadge, TrademarkResult } from "../../../features/listings/badges";
import { useDebounced } from "../../../hooks/use-debounced";
import { errorInfo } from "../../../lib/errors";
import { parseTags, validateListingLive } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/listings/drafts/$draftId")({
  component: DraftPage,
});

function DraftPage() {
  const { t } = useTranslation();
  const { draftId } = Route.useParams();
  const q = useQuery(
    orpc.ai.listings.get.queryOptions({
      input: { id: draftId },
      refetchInterval: (query) =>
        (query.state.data as ListingDraft | undefined)?.status === "generating" ? 2000 : false,
    }),
  );
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/listings/drafts">
          <ArrowLeft />
          {t("nav.aiDrafts")}
        </Link>
      </Button>
      {q.isPending ? (
        <SkeletonRows rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.status === "generating" ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-2/3" />
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("listings.writing", "Claude is writing this draft…")}
          </p>
          <Skeleton className="h-40" />
        </div>
      ) : (
        <DraftEditor key={q.data.updatedAt} draft={q.data} />
      )}
    </div>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return (
    <span
      className={cn(
        "tabular-nums text-xs",
        n > max
          ? "font-medium text-danger"
          : n > max * 0.9
            ? "text-warning"
            : "text-muted-foreground",
      )}
    >
      {n}/{max}
    </span>
  );
}

function DraftEditor({ draft }: { draft: ListingDraft }) {
  const { t } = useTranslation();
  const can = useCan();
  const queryClient = useQueryClient();
  const rules = CHANNEL_RULES[draft.channel].listing;
  const editable =
    can("ai.listings.manage") &&
    (draft.status === "needs_review" || draft.status === "failed" || draft.status === "rejected");
  const [title, setTitle] = useState(draft.content.title);
  const [description, setDescription] = useState(draft.content.description);
  const [tags, setTags] = useState<string[]>(draft.content.tags);
  const [tagInput, setTagInput] = useState("");
  const [bullets, setBullets] = useState<string[]>(draft.content.bullets);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const content: Partial<ListingContent> = useMemo(
    () => ({ title, description, tags, bullets }),
    [title, description, tags, bullets],
  );
  const dirty =
    JSON.stringify(content) !==
    JSON.stringify({
      title: draft.content.title,
      description: draft.content.description,
      tags: draft.content.tags,
      bullets: draft.content.bullets,
    });
  const live = validateListingLive(draft.channel, content);
  const debounced = useDebounced(content, 600);
  const server = useQuery(
    orpc.ai.validate.queryOptions({
      input: { channel: draft.channel, content: debounced },
      enabled: dirty,
      retry: false,
    }),
  );
  const serverResult = dirty ? server.data : draft.validation;
  const issuesFor = (field: string) => live.filter((i) => i.field === field);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.ai.listings.key() });
  const save = useMutation(
    orpc.ai.listings.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("listings.saved", "Draft saved; checks re-ran"));
        invalidate();
      },
    }),
  );
  // T-8-4: `HIGH_TRADEMARK_RISK` (score >= 60) has no override — the server's own message
  // ("...cannot be approved, published or exported") is shown as-is, next to the always-visible
  // trademark panel below that says why. `TRADEMARK_REVIEW_REQUIRED` (25-59) opens the review note
  // dialog; recording one and re-approving is the only way past it.
  const approve = useMutation(
    orpc.ai.listings.approve.mutationOptions({
      meta: { silent: true },
      onSuccess: () => {
        toast.success(t("listings.approved", "Approved"));
        invalidate();
      },
      onError: (e) => {
        const info = errorInfo(e);
        if (info.code === "TRADEMARK_REVIEW_REQUIRED") setReviewOpen(true);
        else toast.error(info.message);
      },
    }),
  );
  const recordReview = useMutation(
    orpc.ai.listings.recordTrademarkReview.mutationOptions({
      onSuccess: () => {
        toast.success(t("listings.trademarkReviewed", "Trademark review recorded"));
        setReviewOpen(false);
        setReviewNote("");
        invalidate();
      },
    }),
  );
  const reject = useMutation(
    orpc.ai.listings.reject.mutationOptions({
      onSuccess: () => {
        setRejectOpen(false);
        invalidate();
      },
    }),
  );
  const regenerate = useMutation(
    orpc.ai.listings.regenerate.mutationOptions({
      onSuccess: () => {
        toast.success(t("listings.regenerating", "Regenerating"));
        invalidate();
      },
    }),
  );
  const connections = useQuery(
    orpc.channels.list.queryOptions({
      input: {},
      enabled: draft.status === "approved",
      retry: false,
    }),
  );
  const publish = useMutation(
    orpc.ai.listings.publish.mutationOptions({
      meta: { silent: true },
      onSuccess: (s) => {
        if (s.pendingApproval)
          toast.info(
            t(
              "listings.pendingApproval",
              "Channel API not approved yet; copy the listing by hand.",
            ),
          );
        else toast.success(t("listings.publishing", "Publishing"));
        invalidate();
      },
      // Same gate as approve (T-8-4): re-checked live, so an approved draft can still be blocked
      // if the risk moved since it was approved.
      onError: (e) => {
        const info = errorInfo(e);
        if (info.code === "TRADEMARK_REVIEW_REQUIRED") setReviewOpen(true);
        else toast.error(info.message);
      },
    }),
  );
  // AC1: an approved draft is exported by hand onto its channel today (no live listing API), so
  // a one-click copy of each field saves retyping it there.
  const canCopy = draft.status === "approved";
  const copyField = (value: string) =>
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t("listings.copied", "Copied")));
  const addTag = () => {
    const next = parseTags(tagInput);
    const seen = new Set(tags.map((x) => x.toLowerCase()));
    const fresh = next.filter((x) => !seen.has(x.toLowerCase()));
    if (fresh.length) setTags([...tags, ...fresh]);
    setTagInput("");
  };
  const errorCount = live.filter((i) => i.severity === "error").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{draft.designName}</h1>
          <ChannelBadge channel={draft.channel} />
          <DraftStatusBadge status={draft.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && dirty && (
            <Button
              variant="outline"
              onClick={() => save.mutate({ id: draft.id, content })}
              disabled={save.isPending}
            >
              {save.isPending && <Loader2 className="animate-spin" />}
              {t("action.save")}
            </Button>
          )}
          {can("ai.listings.approve") && draft.status === "needs_review" && (
            <>
              <Button variant="ghost" className="text-danger" onClick={() => setRejectOpen(true)}>
                <X />
                {t("listings.reject", "Reject")}
              </Button>
              <Button
                onClick={() => approve.mutate({ id: draft.id })}
                disabled={dirty || errorCount > 0 || approve.isPending}
                title={dirty ? t("listings.saveFirst", "Save your edits first") : undefined}
              >
                {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                {t("listings.approve", "Approve")}
              </Button>
            </>
          )}
        </div>
      </div>
      {draft.error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{draft.error}</p>
      )}
      {draft.rejectedReason && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          {t("listings.rejectedBecause", "Rejected: {{reason}}", { reason: draft.rejectedReason })}
        </p>
      )}
      {/* T-8-4 AC1/AC2/AC4: a flagged listing (riskScore >= 25) always shows why, even before the
          checks panel is opened. High risk has no override; medium is cleared by recording a
          review below. */}
      {draft.trademark && draft.trademark.riskScore >= 25 && (
        <p
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
            draft.trademark.riskLevel === "high"
              ? "bg-danger/10 text-danger"
              : "bg-warning/10 text-warning",
          )}
        >
          <AlertTriangle className="size-4 shrink-0" />
          {draft.trademark.riskLevel === "high"
            ? t(
                "listings.trademarkNoticeHigh",
                "Trademark risk {{score}}/100: this listing cannot be approved, published or exported until the flagged text is changed.",
                { score: draft.trademark.riskScore },
              )
            : draft.trademarkReview
              ? t(
                  "listings.trademarkNoticeReviewed",
                  "Trademark risk {{score}}/100: reviewed by compliance, cleared to publish.",
                  { score: draft.trademark.riskScore },
                )
              : t(
                  "listings.trademarkNoticeMedium",
                  "Trademark risk {{score}}/100: a recorded compliance review is required before this listing can be approved, published or exported.",
                  { score: draft.trademark.riskScore },
                )}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Section title={t("listings.content", "Listing")}>
            <div className="flex flex-col gap-4">
              <Field
                label={
                  <span className="flex w-full items-center justify-between">
                    {t("listings.title", "Title")}
                    <span className="flex items-center gap-1.5">
                      <Counter n={title.length} max={rules.titleMax} />
                      {canCopy && (
                        <CopyIconButton
                          value={title}
                          onCopy={copyField}
                          label={t("listings.copyTitle", "Copy title")}
                        />
                      )}
                    </span>
                  </span>
                }
                htmlFor="d-title"
              >
                <Input
                  id="d-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!editable}
                  className={cn(
                    issuesFor("title").some((i) => i.severity === "error") && "border-danger",
                  )}
                />
              </Field>
              <IssueList issues={issuesFor("title")} />
              {rules.tagsMax > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center justify-between text-sm font-medium">
                    {t("listings.tags", "Tags")}
                    <span className="flex items-center gap-1.5">
                      <Counter n={tags.length} max={rules.tagsMax} />
                      {canCopy && (
                        <CopyIconButton
                          value={tags.join(", ")}
                          onCopy={copyField}
                          label={t("listings.copyTags", "Copy tags")}
                        />
                      )}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag, i) => {
                      const bad = rules.tagMaxLen > 0 && tag.length > rules.tagMaxLen;
                      return (
                        <Badge
                          key={tag}
                          variant={bad ? "danger" : "secondary"}
                          className="gap-1 py-1"
                        >
                          {tag}
                          {rules.tagMaxLen > 0 && (
                            <span className="text-[10px] opacity-70">{tag.length}</span>
                          )}
                          {editable && (
                            <button
                              type="button"
                              onClick={() => setTags(tags.filter((_, j) => j !== i))}
                              aria-label={t("action.delete")}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </Badge>
                      );
                    })}
                  </div>
                  {editable && (
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      onBlur={addTag}
                      placeholder={t("listings.addTag", "Add a tag and press Enter")}
                    />
                  )}
                  <IssueList issues={issuesFor("tags")} />
                </div>
              )}
              {rules.bulletsMax > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-sm font-medium">
                    {t("listings.bullets", "Bullet points")}{" "}
                    <Counter n={bullets.length} max={rules.bulletsMax} />
                  </span>
                  {bullets.map((b, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: bullets are positional
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={b}
                        onChange={(e) =>
                          setBullets(bullets.map((x, j) => (j === i ? e.target.value : x)))
                        }
                        disabled={!editable}
                      />
                      <Counter n={b.length} max={rules.bulletMaxLen} />
                    </div>
                  ))}
                  {editable && bullets.length < rules.bulletsMax && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => setBullets([...bullets, ""])}
                    >
                      {t("listings.addBullet", "Add bullet")}
                    </Button>
                  )}
                  <IssueList issues={issuesFor("bullets")} />
                </div>
              )}
              <Field
                label={
                  <span className="flex w-full items-center justify-between">
                    {t("listings.description", "Description")}
                    <span className="flex items-center gap-1.5">
                      <Counter n={description.length} max={rules.descriptionMax} />
                      {canCopy && (
                        <CopyIconButton
                          value={description}
                          onCopy={copyField}
                          label={t("listings.copyDescription", "Copy description")}
                        />
                      )}
                    </span>
                  </span>
                }
                htmlFor="d-desc"
              >
                <Textarea
                  id="d-desc"
                  rows={10}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!editable}
                />
              </Field>
              <IssueList issues={issuesFor("description")} />
              {draft.content.disclosures.length > 0 && (
                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {t("listings.disclosures", "Disclosures added automatically")}
                  </p>
                  {draft.content.disclosures.map((d) => (
                    <p key={d}>{d}</p>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </div>
        <div className="flex flex-col gap-4">
          <Section
            title={t("listings.channelCheck", "{{channel}} rules", {
              channel: CHANNEL_RULES[draft.channel].label,
            })}
          >
            {serverResult ? (
              serverResult.ok && serverResult.warnings.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <Check className="size-4" />
                  {t("listings.passes", "Passes every channel rule")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {serverResult.errors.map((i) => (
                    <li key={`${i.rule}-${i.index}`} className="text-danger">
                      {i.message}
                    </li>
                  ))}
                  {serverResult.warnings.map((i) => (
                    <li key={`${i.rule}-${i.index}`} className="text-warning">
                      {i.message}
                    </li>
                  ))}
                </ul>
              )
            ) : server.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("listings.notChecked", "Not checked yet")}
              </p>
            )}
          </Section>
          {draft.trademark && (
            <Section title={t("nav.trademark")}>
              <div className="flex flex-col gap-3">
                <TrademarkResult check={draft.trademark} />
                {draft.trademarkReview && (
                  <div className="rounded-md bg-muted px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">
                      {t("listings.trademarkReviewedOn", "Reviewed")}{" "}
                      <RelativeTime value={draft.trademarkReview.reviewedAt} />
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{draft.trademarkReview.note}</p>
                  </div>
                )}
              </div>
            </Section>
          )}
          {draft.mockupKeys.length > 0 && (
            <Section title={t("listings.mockups", "Mockups")}>
              <div className="grid grid-cols-2 gap-2">
                {draft.mockupKeys.map((k) => (
                  <SignedImage
                    key={k}
                    fileKey={k}
                    alt={t("listings.mockup", "Mockup")}
                    className="aspect-square"
                    checker={false}
                  />
                ))}
              </div>
            </Section>
          )}
          {draft.status === "approved" && can("ai.listings.approve") && (
            <Section title={t("listings.publish", "Publish")}>
              <div className="flex flex-col gap-2">
                <NativeSelect
                  value={connectionId}
                  onChange={(e) => setConnectionId(e.target.value)}
                  aria-label={t("nav.channels")}
                >
                  <option value="">{t("listings.chooseShop", "Choose a connected shop")}</option>
                  {connections.data?.items
                    .filter((c) => c.channel === draft.channel)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </NativeSelect>
                <Button
                  disabled={!connectionId || publish.isPending}
                  onClick={() => publish.mutate({ id: draft.id, connectionId })}
                >
                  {publish.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  {t("listings.publish", "Publish")}
                </Button>
              </div>
            </Section>
          )}
          <PublishStatusSection draft={draft} />
          {can("ai.listings.manage") && draft.status !== "published" && (
            <Section title={t("listings.regenerate", "Regenerate")}>
              <div className="flex flex-col gap-2">
                <Textarea
                  rows={2}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder={t(
                    "listings.regenHint",
                    "What should change? e.g. shorter title, more gift-focused",
                  )}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    regenerate.mutate({ id: draft.id, brief: brief.trim() || undefined })
                  }
                  disabled={regenerate.isPending}
                >
                  <RefreshCw />
                  {t("listings.regenerate", "Regenerate")}
                </Button>
              </div>
            </Section>
          )}
          <p className="text-xs text-muted-foreground">
            {draft.model ? `${draft.model} · ` : ""}
            {t("listings.creditsUsed", "{{n}} credits", { n: draft.creditsUsed })}
          </p>
        </div>
      </div>
      <ConfirmDialog
        open={reviewOpen}
        onOpenChange={(o) => {
          setReviewOpen(o);
          if (!o) setReviewNote("");
        }}
        title={t("listings.trademarkReviewTitle", "Record a trademark review")}
        description={t(
          "listings.trademarkReviewHint",
          "This listing has a medium trademark risk. A compliance note is required before it can be approved, published or exported.",
        )}
        confirmLabel={t("listings.recordReview", "Record review")}
        pending={recordReview.isPending}
        confirmDisabled={reviewNote.trim().length < 3}
        onConfirm={() => recordReview.mutate({ id: draft.id, note: reviewNote.trim() })}
      >
        <Textarea
          rows={3}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder={t(
            "listings.trademarkReviewNotePlaceholder",
            "Why this is acceptable to publish (at least 3 characters)",
          )}
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t("listings.rejectTitle", "Reject this draft?")}
        confirmLabel={t("listings.reject", "Reject")}
        destructive
        pending={reject.isPending}
        onConfirm={() => reject.mutate({ id: draft.id, reason: rejectReason.trim() || undefined })}
      >
        <Textarea
          rows={2}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder={t("orders.reason", "Reason")}
        />
      </ConfirmDialog>
    </div>
  );
}

/**
 * AC3: `ai.listings.publishStatus`, polled while a publish is in flight, so a failure (or the
 * "channel API not approved yet, exported as CSV instead" note) is always visible, not just at
 * the moment the publish button was clicked.
 */
function PublishStatusSection({ draft }: { draft: ListingDraft }) {
  const { t } = useTranslation();
  const show = draft.status === "publishing" || !!draft.publishedUrl || !!draft.publishedListingId;
  const q = useQuery(
    orpc.ai.listings.publishStatus.queryOptions({
      input: { id: draft.id },
      enabled: show,
      refetchInterval: (query) => (query.state.data?.status === "publishing" ? 2000 : false),
    }),
  );
  if (!show) return null;
  const status = q.data;
  return (
    <Section title={t("listings.publishStatusTitle", "Publish status")}>
      {!status ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <div className="flex flex-col gap-2">
          <DraftStatusBadge status={status.status} />
          {status.error && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{status.error}</p>
          )}
          {status.pendingApproval && (
            <p className="text-sm text-muted-foreground">
              {t(
                "listings.pendingApproval",
                "Channel API not approved yet; copy the listing by hand.",
              )}
            </p>
          )}
          {status.publishedUrl && (
            <a
              href={status.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t("listings.viewPublished", "View the published listing")}
            </a>
          )}
        </div>
      )}
    </Section>
  );
}

/** AC1: a one-click copy of a field's current value, shown once a draft is approved. */
function CopyIconButton({
  value,
  onCopy,
  label,
}: {
  value: string;
  onCopy: (value: string) => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-5"
      onClick={() => onCopy(value)}
      aria-label={label}
      title={label}
    >
      <Copy className="size-3" />
    </Button>
  );
}

function IssueList({ issues }: { issues: { severity: "error" | "warn"; message: string }[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="-mt-2 flex flex-col gap-0.5 text-xs">
      {issues.map((i) => (
        <li
          key={i.message}
          className={cn(
            "flex items-center gap-1",
            i.severity === "error" ? "text-danger" : "text-warning",
          )}
        >
          <AlertTriangle className="size-3" />
          {i.message}
        </li>
      ))}
    </ul>
  );
}

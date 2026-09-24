import { CHANNEL_RULES, type ListingContent, type ListingDraft } from "@invai/contracts";
import { Badge, Button, ChannelBadge, cn, Input, Skeleton, Textarea, toast } from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw, Send, X } from "lucide-react";
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
  const [riskOpen, setRiskOpen] = useState(false);
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
  const approve = useMutation(
    orpc.ai.listings.approve.mutationOptions({
      meta: { silent: true },
      onSuccess: () => {
        toast.success(t("listings.approved", "Approved"));
        setRiskOpen(false);
        invalidate();
      },
      onError: (e) => {
        const info = errorInfo(e);
        if (info.code === "HIGH_TRADEMARK_RISK") setRiskOpen(true);
        else toast.error(info.message);
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
    }),
  );
  const addTag = () => {
    const next = parseTags(tagInput);
    if (next.length) setTags([...tags, ...next]);
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
                onClick={() => approve.mutate({ id: draft.id, acknowledgeRisk: false })}
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Section title={t("listings.content", "Listing")}>
            <div className="flex flex-col gap-4">
              <Field
                label={
                  <span className="flex w-full justify-between">
                    {t("listings.title", "Title")} <Counter n={title.length} max={rules.titleMax} />
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
                  <span className="flex justify-between text-sm font-medium">
                    {t("listings.tags", "Tags")} <Counter n={tags.length} max={rules.tagsMax} />
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag, i) => {
                      const bad = rules.tagMaxLen > 0 && tag.length > rules.tagMaxLen;
                      return (
                        <Badge
                          key={`${tag}-${i}`}
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
                  <span className="flex w-full justify-between">
                    {t("listings.description", "Description")}{" "}
                    <Counter n={description.length} max={rules.descriptionMax} />
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
              <TrademarkResult check={draft.trademark} />
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
          {draft.publishedUrl && (
            <a
              href={draft.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t("listings.viewPublished", "View the published listing")}
            </a>
          )}
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
        open={riskOpen}
        onOpenChange={setRiskOpen}
        title={t("listings.highRisk", "High trademark risk")}
        description={t(
          "listings.highRiskHint",
          "This listing may conflict with a registered mark. Approve anyway?",
        )}
        confirmLabel={t("listings.approveAnyway", "Approve anyway")}
        destructive
        pending={approve.isPending}
        onConfirm={() => approve.mutate({ id: draft.id, acknowledgeRisk: true })}
      />
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

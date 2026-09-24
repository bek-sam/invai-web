import {
  type BlankVariant,
  CHANNELS,
  type Design,
  SKU_PATTERN_TYPES,
  SKU_TEMPLATE_FIELDS,
  type SkuRule,
  type SkuSuggestion,
  type UnmappedSku,
} from "@invai/contracts";
import {
  Badge,
  Button,
  ChannelBadge,
  Checkbox,
  cn,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  RelativeTime,
  ShipByBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, CheckCheck, Link2, Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Field, NativeSelect, Page } from "../../../components/page";
import { BlankPicker, DesignPicker } from "../../../components/pickers";
import { BlankRef, DesignRef } from "../../../components/refs";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { useDebounced } from "../../../hooks/use-debounced";
import { formatPct } from "../../../lib/format";
import { useCan } from "../../../lib/me";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/catalog/sku-mapping")({
  component: SkuMappingPage,
});

type Mapping = {
  channelSku: string;
  channel?: (typeof CHANNELS)[number];
  designId: string;
  blankVariantId: string;
  saveRule?: {
    name: string | null;
    patternType: (typeof SKU_PATTERN_TYPES)[number];
    pattern: string;
    channel: (typeof CHANNELS)[number] | null;
    connectionId: string | null;
    target: SkuRule["target"];
    priority: number;
    active: boolean;
  };
};

function exactRule(sku: string, designId: string, blankVariantId: string): Mapping["saveRule"] {
  return {
    name: null,
    patternType: "exact",
    pattern: sku,
    channel: null,
    connectionId: null,
    target: { kind: "direct", designId, blankVariantId },
    priority: 0,
    active: true,
  };
}

function mappingFromSuggestion(u: UnmappedSku, s: SkuSuggestion): Mapping | null {
  if (!s.designId || !s.blankVariantId) return null;
  return {
    channelSku: u.channelSku,
    channel: u.channel,
    designId: s.designId,
    blankVariantId: s.blankVariantId,
    saveRule: s.rule
      ? {
          name: null,
          patternType: s.rule.patternType,
          pattern: s.rule.pattern,
          channel: null,
          connectionId: null,
          target: s.rule.target,
          priority: 0,
          active: true,
        }
      : exactRule(u.channelSku, s.designId, s.blankVariantId),
  };
}

function SkuMappingPage() {
  const { t } = useTranslation();
  return (
    <Page
      title={t("nav.skuMapping")}
      description={t(
        "sku.subtitle",
        "Map each channel SKU to a design and blank once; rules remember it.",
      )}
    >
      <Tabs defaultValue="unmapped">
        <TabsList className="mb-3">
          <TabsTrigger value="unmapped">{t("sku.unmapped", "Unmapped SKUs")}</TabsTrigger>
          <TabsTrigger value="rules">{t("sku.rules", "Rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="unmapped">
          <Unmapped />
        </TabsContent>
        <TabsContent value="rules">
          <Rules />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function Unmapped() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can("sku_rules.manage");
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState("");
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Map<string, SkuSuggestion>>(new Map());
  const [manual, setManual] = useState<UnmappedSku | null>(null);
  const list = useInfiniteQuery(
    orpc.skuRules.unmapped.infiniteOptions({
      input: (cursor: string | undefined) => ({
        channel: (channel || undefined) as never,
        search: q || undefined,
        cursor,
        limit: 100,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const totals = list.data?.pages[0];
  const key = (u: UnmappedSku) => `${u.channel}:${u.channelSku}`;

  const suggest = useMutation(
    orpc.skuRules.suggest.mutationOptions({
      onSuccess: (res) => {
        setSuggestions((prev) => {
          const next = new Map(prev);
          for (const s of res.items) next.set(s.channelSku, s);
          return next;
        });
        toast.success(t("sku.suggested", "{{count}} suggestions", { count: res.items.length }), {
          description: res.creditsUsed
            ? t("sku.credits", "{{count}} AI credits used", { count: res.creditsUsed })
            : undefined,
        });
      },
    }),
  );
  const apply = useMutation(
    orpc.skuRules.bulkApply.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          t("sku.applied", "Mapped {{items}} items, {{rules}} rules saved", {
            items: res.itemsMapped,
            rules: res.rulesCreated,
          }),
          {
            description: res.failed.length
              ? res.failed.map((f) => `${f.channelSku}: ${f.message}`).join("; ")
              : undefined,
          },
        );
        setSelected(new Set());
        void queryClient.invalidateQueries({ queryKey: orpc.skuRules.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.today.key() });
      },
    }),
  );

  const targets = rows.filter((u) => selected.size === 0 || selected.has(key(u)));
  const confident = rows
    .map((u) => {
      const s = suggestions.get(u.channelSku);
      return s && s.confidence >= 0.8 ? mappingFromSuggestion(u, s) : null;
    })
    .filter((m): m is Mapping => m !== null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("sku.search", "Search SKU or title")}
          className="max-w-xs"
        />
        <NativeSelect
          aria-label={t("orders.channel", "Channel")}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          <option value="">{t("orders.allChannels", "All channels")}</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`channel.${c}`, c)}
            </option>
          ))}
        </NativeSelect>
        {totals && (
          <span className="text-sm text-muted-foreground">
            {t("sku.totals", "{{skus}} SKUs · {{items}} items waiting", {
              skus: totals.totalSkus,
              items: totals.totalItems,
            })}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={targets.length === 0 || suggest.isPending}
            onClick={() =>
              suggest.mutate({
                channelSkus: [...new Set(targets.map((u) => u.channelSku))].slice(0, 200),
                useAi: true,
              })
            }
          >
            {suggest.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {selected.size
              ? t("sku.suggestSelected", "Suggest for {{count}}", { count: selected.size })
              : t("sku.suggestAll", "Suggest mappings")}
          </Button>
          {manage && (
            <Button
              size="sm"
              disabled={confident.length === 0 || apply.isPending}
              onClick={() => apply.mutate({ mappings: confident })}
            >
              <CheckCheck />
              {t("sku.acceptConfident", "Accept {{count}} at ≥80%", { count: confident.length })}
            </Button>
          )}
        </div>
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border">
          <EmptyState
            icon={Check}
            title={t("sku.allMapped", "Every SKU is mapped")}
            description={t("sku.allMappedHint", "New SKUs from imports show up here.")}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="w-9 px-3 py-2">
                  <Checkbox
                    aria-label={t("orders.selectAll", "Select all")}
                    checked={
                      selected.size > 0 && selected.size === rows.length
                        ? true
                        : selected.size > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => setSelected(v ? new Set(rows.map(key)) : new Set())}
                  />
                </th>
                <th className="px-2 py-2 text-left font-medium">{t("sku.sku", "Channel SKU")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("sku.items", "Items")}</th>
                <th className="px-2 py-2 text-left font-medium">{t("sku.due", "Earliest due")}</th>
                <th className="px-2 py-2 text-left font-medium">
                  {t("sku.suggestion", "Suggestion")}
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const s = suggestions.get(u.channelSku);
                const m = s ? mappingFromSuggestion(u, s) : null;
                return (
                  <tr key={key(u)} className="border-t border-border align-top">
                    <td className="px-3 py-2.5">
                      <Checkbox
                        aria-label={t("orders.select", "Select")}
                        checked={selected.has(key(u))}
                        onCheckedChange={(v) => {
                          const n = new Set(selected);
                          if (v) n.add(key(u));
                          else n.delete(key(u));
                          setSelected(n);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <ChannelBadge channel={u.channel} />
                        <span className="font-mono text-xs font-medium">{u.channelSku}</span>
                      </div>
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                        {u.sampleTitle}
                        {u.sampleVariantTitle ? ` · ${u.sampleVariantTitle}` : ""}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {u.itemCount}
                      <span className="block text-xs text-muted-foreground">
                        {t("sku.nOrders", "{{count}} orders", { count: u.orderCount })}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {u.earliestShipBy ? <ShipByBadge shipBy={u.earliestShipBy} /> : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {s ? (
                        s.designId ? (
                          <div className="flex flex-col gap-0.5 text-xs">
                            <DesignRef id={s.designId} />
                            <BlankRef id={s.blankVariantId} />
                            <div className="mt-0.5 flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full",
                                    s.confidence >= 0.8
                                      ? "bg-success"
                                      : s.confidence >= 0.5
                                        ? "bg-warning"
                                        : "bg-danger",
                                  )}
                                  style={{ width: `${s.confidence * 100}%` }}
                                />
                              </div>
                              <span className="tabular-nums">{formatPct(s.confidence)}</span>
                              <Badge variant="secondary" className="px-1.5 text-[10px]">
                                {s.source === "ai" && <Sparkles className="size-3" />}
                                {t(`sku.source.${s.source}`, s.source)}
                              </Badge>
                            </div>
                            <p className="max-w-sm text-muted-foreground" title={s.explanation}>
                              {s.explanation}
                            </p>
                            {s.rule && (
                              <p className="text-muted-foreground">
                                {t("sku.ruleWould", "Rule {{pattern}} would map {{count}} SKUs", {
                                  pattern: s.rule.pattern,
                                  count: s.rule.wouldMatchCount,
                                })}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {s.explanation || t("sku.noMatch", "No confident match")}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {manage && (
                        <div className="flex justify-end gap-1.5">
                          {m && (
                            <Button
                              size="sm"
                              onClick={() => apply.mutate({ mappings: [m] })}
                              disabled={apply.isPending}
                            >
                              <Check />
                              {t("sku.accept", "Accept")}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setManual(u)}>
                            <Link2 />
                            {t("sku.map", "Map")}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.hasNextPage && (
            <div className="border-t border-border p-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {t("action.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
      {manual && (
        <ManualMapDialog
          sku={manual}
          pending={apply.isPending}
          onClose={() => setManual(null)}
          onSubmit={(mapping) =>
            apply.mutate({ mappings: [mapping] }, { onSuccess: () => setManual(null) })
          }
        />
      )}
    </div>
  );
}

function ManualMapDialog({
  sku,
  pending,
  onClose,
  onSubmit,
}: {
  sku: UnmappedSku;
  pending: boolean;
  onClose: () => void;
  onSubmit: (m: Mapping) => void;
}) {
  const { t } = useTranslation();
  const [design, setDesign] = useState<Design | null>(null);
  const [blank, setBlank] = useState<BlankVariant | null>(null);
  const [saveRule, setSaveRule] = useState(true);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("orders.mapTitle", "Map SKU {{sku}}", { sku: sku.channelSku })}
          </DialogTitle>
          <DialogDescription>
            {sku.sampleTitle}
            {sku.sampleVariantTitle ? ` · ${sku.sampleVariantTitle}` : ""} ·{" "}
            {t("sku.itemsWaiting", "{{count}} items waiting", { count: sku.itemCount })}
          </DialogDescription>
        </DialogHeader>
        <Field label={t("orders.design", "Design")}>
          <DesignPicker value={design} onChange={setDesign} />
        </Field>
        <Field label={t("orders.blank", "Blank")}>
          <BlankPicker value={blank} onChange={setBlank} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={saveRule} onCheckedChange={(v) => setSaveRule(!!v)} />
          {t("orders.saveRule", "Remember this SKU (save a mapping rule)")}
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!design || !blank || pending}
            onClick={() =>
              design &&
              blank &&
              onSubmit({
                channelSku: sku.channelSku,
                channel: sku.channel,
                designId: design.id,
                blankVariantId: blank.id,
                saveRule: saveRule ? exactRule(sku.channelSku, design.id, blank.id) : undefined,
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("orders.map", "Map item")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Rules() {
  const { t } = useTranslation();
  const can = useCan();
  const manage = can("sku_rules.manage");
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SkuRule | null>(null);
  const rules = useInfiniteQuery(
    orpc.skuRules.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 200 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const rows = useMemo(() => rules.data?.pages.flatMap((p) => p.items) ?? [], [rules.data]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: orpc.skuRules.key() });
  const update = useMutation(
    orpc.skuRules.update.mutationOptions({ onSuccess: () => void invalidate() }),
  );
  const del = useMutation(
    orpc.skuRules.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t("sku.ruleDeleted", "Rule deleted"));
        setDeleting(null);
        void invalidate();
      },
    }),
  );
  const columns: DataTableColumn<SkuRule>[] = [
    {
      accessorKey: "pattern",
      header: t("sku.pattern", "Pattern"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.pattern}</span>,
    },
    {
      accessorKey: "patternType",
      header: t("sku.type", "Type"),
      cell: ({ row }) => (
        <Badge variant="secondary">
          {t(`sku.patternType.${row.original.patternType}`, row.original.patternType)}
        </Badge>
      ),
    },
    {
      accessorKey: "channel",
      header: t("orders.channel", "Channel"),
      cell: ({ row }) =>
        row.original.channel ? (
          <ChannelBadge channel={row.original.channel} />
        ) : (
          t("sku.any", "Any")
        ),
    },
    {
      id: "target",
      header: t("sku.target", "Maps to"),
      cell: ({ row }) =>
        row.original.target.kind === "direct" ? (
          <span className="flex flex-col text-xs">
            <DesignRef id={row.original.target.designId} />
            <BlankRef id={row.original.target.blankVariantId} />
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("sku.resolveByCode", "Resolved by codes in the SKU")}
          </span>
        ),
    },
    {
      accessorKey: "source",
      header: t("sku.sourceCol", "Source"),
      cell: ({ row }) => t(`sku.ruleSource.${row.original.source}`, row.original.source),
    },
    {
      accessorKey: "matchCount",
      header: t("sku.matches", "Matches"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.matchCount}
          {row.original.lastMatchedAt && (
            <RelativeTime
              value={row.original.lastMatchedAt}
              className="ml-1 text-xs text-muted-foreground"
            />
          )}
        </span>
      ),
    },
    {
      id: "active",
      header: t("sku.active", "Active"),
      cell: ({ row }) => (
        <Switch
          checked={row.original.active}
          disabled={!manage}
          onCheckedChange={(v) => update.mutate({ id: row.original.id, active: v })}
          aria-label={t("sku.active", "Active")}
        />
      ),
    },
    {
      id: "del",
      header: "",
      cell: ({ row }) =>
        manage && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setDeleting(row.original)}
            aria-label={t("action.delete")}
          >
            <Trash2 />
          </Button>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      {manage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            {t("sku.newRule", "New rule")}
          </Button>
        </div>
      )}
      {rules.isError ? (
        <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : (
        <DataTable
          columns={columns as DataTableColumn<SkuRule, unknown>[]}
          data={rows}
          getRowId={(r) => r.id}
          isLoading={rules.isPending}
          hasMore={!!rules.hasNextPage}
          onLoadMore={() => void rules.fetchNextPage()}
          isLoadingMore={rules.isFetchingNextPage}
          emptyTitle={t("sku.noRules", "No rules yet")}
          emptyDescription={t(
            "sku.noRulesHint",
            "Rules are learned when you map an item, or create a pattern like {style}-{color}-{size}-{design}.",
          )}
          maxHeight="calc(100dvh - 17rem)"
          estimateRowHeightPx={52}
        />
      )}
      {creating && <RuleDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("sku.deleteRule", "Delete rule {{pattern}}?", {
          pattern: deleting?.pattern ?? "",
        })}
        description={t("sku.deleteRuleHint", "Items already mapped keep their mapping.")}
        destructive
        pending={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function RuleDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [patternType, setPatternType] = useState<(typeof SKU_PATTERN_TYPES)[number]>("template");
  const [pattern, setPattern] = useState("{style}-{color}-{size}-{design}");
  const [channel, setChannel] = useState("");
  const [brandDefault, setBrandDefault] = useState("");
  const [design, setDesign] = useState<Design | null>(null);
  const [blank, setBlank] = useState<BlankVariant | null>(null);
  const [sample, setSample] = useState("");
  const debouncedSample = useDebounced(sample.trim(), 300);
  const debouncedPattern = useDebounced(pattern.trim(), 300);
  const target: SkuRule["target"] =
    patternType === "exact"
      ? { kind: "direct", designId: design?.id ?? "", blankVariantId: blank?.id ?? "" }
      : { kind: "resolve", defaults: brandDefault ? { brand: brandDefault } : {} };
  const test = useQuery(
    orpc.skuRules.test.queryOptions({
      input: { patternType, pattern: debouncedPattern, target, sample: debouncedSample },
      enabled:
        !!debouncedSample &&
        !!debouncedPattern &&
        (patternType !== "exact" || (!!design && !!blank)),
      retry: false,
    }),
  );
  const create = useMutation(
    orpc.skuRules.create.mutationOptions({
      onSuccess: () => {
        toast.success(t("sku.ruleCreated", "Rule created"));
        void queryClient.invalidateQueries({ queryKey: orpc.skuRules.key() });
        onClose();
      },
    }),
  );
  const valid = pattern.trim() && (patternType !== "exact" || (design && blank));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("sku.newRule", "New rule")}</DialogTitle>
          <DialogDescription>
            {t(
              "sku.ruleHint",
              "Template fields: {{fields}}. Regex patterns use the same names as named groups.",
              {
                fields: SKU_TEMPLATE_FIELDS.map((f) => `{${f}}`).join(" "),
              },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("sku.type", "Type")} htmlFor="rule-type">
            <NativeSelect
              id="rule-type"
              value={patternType}
              onChange={(e) => setPatternType(e.target.value as typeof patternType)}
            >
              {SKU_PATTERN_TYPES.map((p) => (
                <option key={p} value={p}>
                  {t(`sku.patternType.${p}`, p)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("orders.channel", "Channel")} htmlFor="rule-channel">
            <NativeSelect
              id="rule-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">{t("sku.any", "Any")}</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`channel.${c}`, c)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={t("sku.pattern", "Pattern")}
            htmlFor="rule-pattern"
            className="sm:col-span-2"
          >
            <Input
              id="rule-pattern"
              className="font-mono"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
            />
          </Field>
          {patternType === "exact" ? (
            <>
              <Field label={t("orders.design", "Design")} className="sm:col-span-2">
                <DesignPicker value={design} onChange={setDesign} />
              </Field>
              <Field label={t("orders.blank", "Blank")} className="sm:col-span-2">
                <BlankPicker value={blank} onChange={setBlank} />
              </Field>
            </>
          ) : (
            <Field label={t("sku.brandDefault", "Brand (if not in the SKU)")} htmlFor="rule-brand">
              <Input
                id="rule-brand"
                value={brandDefault}
                onChange={(e) => setBrandDefault(e.target.value)}
              />
            </Field>
          )}
          <Field
            label={t("sku.testSample", "Test with a SKU")}
            htmlFor="rule-sample"
            className="sm:col-span-2"
          >
            <Input
              id="rule-sample"
              className="font-mono"
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="BC3001-BLK-M-D1042"
            />
          </Field>
        </div>
        {debouncedSample && (
          <div className="rounded-md border border-border p-2 text-xs">
            {test.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : test.isError ? (
              <span className="text-danger">{(test.error as Error).message}</span>
            ) : test.data ? (
              test.data.matched ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-success">{t("sku.matched", "Matches")}</span>
                  <span className="font-mono">
                    {Object.entries(test.data.fields)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("  ")}
                  </span>
                  <DesignRef id={test.data.designId} />
                  <BlankRef id={test.data.blankVariantId} />
                </div>
              ) : (
                <span className="text-warning">
                  {test.data.error ?? t("sku.noMatchSample", "Doesn't match this SKU")}
                </span>
              )
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate({
                name: null,
                patternType,
                pattern: pattern.trim(),
                channel: (channel || null) as never,
                connectionId: null,
                target,
                priority: 0,
                active: true,
              })
            }
          >
            {create.isPending && <Loader2 className="animate-spin" />}
            {t("action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

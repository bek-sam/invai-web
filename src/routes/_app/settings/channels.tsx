import {
  type ChannelConnection,
  CONNECTABLE_CHANNELS,
  type ConnectionHealth,
  CSV_FORMATS,
  type ImportReport,
} from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  ChannelBadge,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  RelativeTime,
  Switch,
  toast,
} from "@invai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileUp,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Settings2,
  Unplug,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { Field, NativeSelect, Page } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import {
  CsvImportDialog,
  ReportStats,
  RowErrors,
} from "../../../features/catalog/csv-import-dialog";
import { ConnectionIssues, StockPushToggle } from "../../../features/channels/connection-issues";
import { ImportHistory } from "../../../features/channels/import-history";
import {
  canReconnect,
  connectionIssues,
  type OAuthReturn,
  readOAuthReturn,
  reconnectDomain,
} from "../../../features/channels/status";
import { errorInfo } from "../../../lib/errors";
import { useCan } from "../../../lib/me";
import { client, orpc } from "../../../lib/rpc";

const optionalText = z.string().max(500).optional().catch(undefined);

export const Route = createFileRoute("/_app/settings/channels")({
  validateSearch: z.object({
    import: z.boolean().optional().catch(undefined),
    connected: optionalText,
    connectionId: optionalText,
    error: optionalText,
  }),
  component: ChannelsPage,
});

type ConnectPreset = { channel: "shopify"; shop: string };

function ChannelsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/settings/channels" });
  const queryClient = useQueryClient();
  const q = useQuery(orpc.channels.list.queryOptions({ input: {} }));
  const healthQ = useQuery(orpc.channels.health.queryOptions({ input: {}, retry: false }));
  const [connectOpen, setConnectOpen] = useState<ConnectPreset | true | false>(false);
  const [importOpen, setImportOpen] = useState(!!search.import);
  const [importConn, setImportConn] = useState("");
  const [format, setFormat] = useState<(typeof CSV_FORMATS)[number]>("etsy");
  const [editing, setEditing] = useState<ChannelConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState<ChannelConnection | null>(null);
  const oauth = readOAuthReturn(search);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: orpc.channels.key() });
  const sync = useMutation(
    orpc.channels.syncNow.mutationOptions({
      onSuccess: () => toast.success(t("channels.syncing", "Sync started")),
    }),
  );
  const disconnect = useMutation(
    orpc.channels.disconnect.mutationOptions({
      onSuccess: () => {
        setDisconnecting(null);
        invalidate();
      },
    }),
  );
  const connections = q.data?.items.filter((c) => c.status !== "disconnected") ?? [];
  const importTarget = importConn || connections[0]?.id || "";
  const healthOf = (c: ChannelConnection): ConnectionHealth =>
    healthQ.data?.items.find((h) => h.connectionId === c.id)?.health ?? c.health;
  const clearOAuth = () =>
    void navigate({
      search: (s) => ({ ...s, connected: undefined, connectionId: undefined, error: undefined }),
      replace: true,
    });
  const openImport = (c: ChannelConnection) => {
    setImportConn(c.id);
    setFormat(
      c.channel === "shopify"
        ? "shopify"
        : (CSV_FORMATS as readonly string[]).includes(c.channel)
          ? (c.channel as never)
          : "generic",
    );
    setImportOpen(true);
  };
  return (
    <Page
      wide={false}
      title={t("nav.channels")}
      description={t(
        "channels.subtitle",
        "Where orders come from. Shopify connects by API; other marketplaces import from their CSV exports.",
      )}
      actions={
        <>
          {can("channels.import") && (
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              disabled={connections.length === 0}
            >
              <FileUp />
              {t("today.importCsv", "Import CSV")}
            </Button>
          )}
          {can("channels.manage") && (
            <Button onClick={() => setConnectOpen(true)}>
              <Plus />
              {t("channels.connect", "Connect")}
            </Button>
          )}
        </>
      }
    >
      {oauth && (
        <OAuthBanner
          result={oauth}
          name={
            oauth.kind === "connected"
              ? connections.find((c) => c.id === oauth.connectionId)?.name
              : undefined
          }
          onDismiss={clearOAuth}
          onRetry={can("channels.manage") ? () => setConnectOpen(true) : undefined}
        />
      )}
      {q.isPending ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : connections.length === 0 ? (
        <Card>
          <EmptyState
            icon={Plug}
            title={t("channels.none", "No channels yet")}
            description={t(
              "channels.noneHint",
              "Connect Shopify or add a marketplace to import its CSV exports.",
            )}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              connection={c}
              health={healthOf(c)}
              highlight={oauth?.kind === "connected" && oauth.connectionId === c.id}
              syncing={sync.isPending && sync.variables?.id === c.id}
              onSync={() => sync.mutate({ id: c.id })}
              onImport={() => openImport(c)}
              onEdit={() => setEditing(c)}
              onDisconnect={() => setDisconnecting(c)}
              onReconnect={(shop) => setConnectOpen({ channel: "shopify", shop })}
            />
          ))}
        </div>
      )}
      {connectOpen && (
        <ConnectDialog
          preset={connectOpen === true ? null : connectOpen}
          onClose={() => setConnectOpen(false)}
          onDone={invalidate}
        />
      )}
      {editing && (
        <ConnectionSettingsDialog
          connection={editing}
          onClose={() => setEditing(null)}
          onDone={invalidate}
        />
      )}
      <CsvImportDialog<ImportReport>
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o && search.import)
            void navigate({ search: (s) => ({ ...s, import: undefined }), replace: true });
        }}
        title={t("channels.importTitle", "Import orders from CSV")}
        description={t(
          "channels.importHint",
          "Re-importing the same file updates orders instead of duplicating them.",
        )}
        canSubmit={!!importTarget}
        extra={
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("channels.connection", "Channel")} htmlFor="imp-conn">
              <NativeSelect
                id="imp-conn"
                value={importTarget}
                onChange={(e) => setImportConn(e.target.value)}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t(`channel.${c.channel}`, c.channel)} · {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("channels.format", "File format")} htmlFor="imp-format">
              <NativeSelect
                id="imp-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
              >
                {CSV_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {t(`csvFormat.${f}`, f)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        }
        onImport={async (fileKey) => {
          const r = await client.channels.importCsv({ id: importTarget, fileKey, format });
          void queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
          void queryClient.invalidateQueries({ queryKey: orpc.today.key() });
          void queryClient.invalidateQueries({ queryKey: orpc.skuRules.key() });
          invalidate();
          return r;
        }}
        renderReport={(r) =>
          r.status === "queued" || r.status === "running" ? (
            <p className="text-sm">
              {t(
                "channels.importQueued",
                "This file has {{n}} rows, so it imports in the background. Follow it under Import history on this page.",
                { n: r.rowsTotal },
              )}
            </p>
          ) : (
            <div>
              <ReportStats
                stats={[
                  [t("channels.imported", "New orders"), r.ordersImported, "ok"],
                  [t("channels.updated", "Updated"), r.ordersUpdated, "neutral"],
                  [t("channels.skipped", "Unchanged"), r.ordersSkipped, "neutral"],
                  [t("channels.rowsFailed", "Rows failed"), r.rowsFailed, "bad"],
                ]}
              />
              {r.itemsNeedingMapping > 0 && (
                <p className="mt-3 text-sm">
                  {t("channels.needMapping", "{{n}} items need SKU mapping.", {
                    n: r.itemsNeedingMapping,
                  })}{" "}
                  <Link
                    to="/catalog/sku-mapping"
                    className="font-medium text-primary hover:underline"
                  >
                    {t("channels.mapNow", "Map them now")}
                  </Link>
                </p>
              )}
              <RowErrors errors={r.errors} />
            </div>
          )
        }
      />
      <ConfirmDialog
        open={!!disconnecting}
        onOpenChange={(o) => !o && setDisconnecting(null)}
        title={t("channels.disconnectTitle", "Disconnect {{name}}?", {
          name: disconnecting?.name ?? "",
        })}
        description={t(
          "channels.disconnectHint",
          "Existing orders stay. New orders stop arriving from this channel.",
        )}
        destructive
        pending={disconnect.isPending}
        onConfirm={() => disconnecting && disconnect.mutate({ id: disconnecting.id })}
      />
    </Page>
  );
}

function OAuthBanner({
  result,
  name,
  onDismiss,
  onRetry,
}: {
  result: OAuthReturn;
  name: string | undefined;
  onDismiss: () => void;
  onRetry: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const ok = result.kind === "connected";
  const text = ok
    ? name
      ? t(
          "channels.oauth.connectedNamed",
          "{{name}} is connected. New orders arrive on their own.",
          {
            name,
          },
        )
      : t(
          "channels.oauth.connected",
          "Your Shopify store is connected. New orders arrive on their own.",
        )
    : result.reason === "expired"
      ? t(
          "channels.oauth.expired",
          "The Shopify approval link expired before it was finished. Connect the store again.",
        )
      : result.reason === "elsewhere"
        ? t(
            "channels.oauth.elsewhere",
            "This Shopify store is already connected to another InvAI account. Disconnect it there first.",
          )
        : result.reason === "declined"
          ? t(
              "channels.oauth.declined",
              "Access wasn't approved in Shopify, so the store isn't connected. Try again when you're ready.",
            )
          : t(
              "channels.oauth.failed",
              "Shopify didn't finish connecting the store. Try connecting it again.",
            );
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm",
        ok ? "border-success/40 bg-success/10" : "border-danger/40 bg-danger/10",
      )}
    >
      <Icon className={cn("size-4 shrink-0", ok ? "text-success" : "text-danger")} aria-hidden />
      <p className="min-w-0 flex-1">{text}</p>
      <div className="flex items-center gap-1">
        {!ok && onRetry && result.reason !== "elsewhere" && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("channels.oauth.retry", "Connect again")}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onDismiss}
          aria-label={t("channels.oauth.dismiss", "Hide this message")}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

function ConnectionCard({
  connection: c,
  health,
  highlight,
  syncing,
  onSync,
  onImport,
  onEdit,
  onDisconnect,
  onReconnect,
}: {
  connection: ChannelConnection;
  health: ConnectionHealth;
  highlight: boolean;
  syncing: boolean;
  onSync: () => void;
  onImport: () => void;
  onEdit: () => void;
  onDisconnect: () => void;
  onReconnect: (shop: string) => void;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const [historyOpen, setHistoryOpen] = useState(c.mode === "csv");
  const shop = canReconnect(c) ? reconnectDomain(c) : null;
  // A problem we explain below also means the badge can't say "Healthy".
  const healthy = health.ok && !connectionIssues(c, health).some((i) => i.kind !== "approval");
  const statusBadge =
    c.status === "pending" ? (
      <Badge variant="warning">{t("channels.state.pending", "Not finished")}</Badge>
    ) : (
      <Badge variant={healthy ? "success" : "danger"}>
        {healthy ? t("channels.healthy", "Healthy") : t("channels.unhealthy", "Needs attention")}
      </Badge>
    );
  return (
    <Card className={cn("flex flex-col gap-3 p-4", highlight && "ring-2 ring-success")}>
      <div className="flex flex-wrap items-center gap-3">
        <ChannelBadge channel={c.channel} />
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {c.mode === "api" ? t("channels.api", "API") : t("channels.csv", "CSV import")}
            {c.provider === "mock" && ` · ${t("channels.mock", "sandbox")}`}
            {health.lastImportAt && (
              <>
                {" · "}
                {t("channels.lastImport", "last import")}{" "}
                <RelativeTime value={health.lastImportAt} />
              </>
            )}
            {` · ${t("channels.orders24h", "{{n}} orders in 24h", { n: health.ordersLast24h })}`}
          </p>
        </div>
        {statusBadge}
        {health.pendingApproval && (
          <Badge variant="warning">{t("channels.pendingApproval", "API pending approval")}</Badge>
        )}
        <div className="flex flex-wrap gap-1">
          {shop && can("channels.manage") && (
            <Button size="sm" onClick={() => onReconnect(shop)}>
              <Plug />
              {t("channels.reconnect", "Reconnect")}
            </Button>
          )}
          {c.mode === "api" && c.status !== "pending" && can("channels.manage") && (
            <Button size="sm" variant="ghost" onClick={onSync} disabled={syncing}>
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("channels.sync", "Sync")}
            </Button>
          )}
          {can("channels.import") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onImport}
              aria-label={t("channels.importFor", "Import a CSV for {{name}}", { name: c.name })}
            >
              <FileUp />
              CSV
            </Button>
          )}
          {can("channels.manage") && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={onEdit}
                aria-label={t("channels.settingsFor", "Settings for {{name}}", { name: c.name })}
              >
                <Settings2 />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-danger"
                onClick={onDisconnect}
                aria-label={t("channels.disconnect", "Disconnect")}
              >
                <Unplug />
              </Button>
            </>
          )}
        </div>
      </div>
      <ConnectionIssues connection={c} health={health} />
      <StockPushToggle connection={c} health={health} canManage={can("channels.manage")} />
      <div>
        <button
          type="button"
          className="flex items-center gap-1 rounded-sm text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          {historyOpen ? (
            <ChevronDown className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
          {t("channels.history.title", "Import history")}
        </button>
        {historyOpen && (
          <div className="mt-2">
            <ImportHistory connectionId={c.id} />
          </div>
        )}
      </div>
    </Card>
  );
}

function ConnectDialog({
  preset,
  onClose,
  onDone,
}: {
  preset: ConnectPreset | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<(typeof CONNECTABLE_CHANNELS)[number]>(
    preset?.channel ?? "shopify",
  );
  const [shop, setShop] = useState(preset?.shop.replace(/\.myshopify\.com$/, "") ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const connect = useMutation(
    orpc.channels.connect.mutationOptions({
      meta: { silent: true },
      onSuccess: (r) => {
        if (r.kind === "oauth") {
          window.location.href = r.authorizeUrl;
          return;
        }
        toast.success(t("channels.connected", "{{name}} added", { name: r.connection.name }));
        onDone();
        onClose();
      },
      onError: (err) => {
        const info = errorInfo(err);
        setError(
          info.code === "ALREADY_CONNECTED"
            ? /another/i.test(info.message)
              ? t(
                  "channels.oauth.elsewhere",
                  "This Shopify store is already connected to another InvAI account. Disconnect it there first.",
                )
              : t(
                  "channels.alreadyConnected",
                  "This store is still connected here. To connect it fresh, disconnect it first, then connect it again.",
                )
            : info.message,
        );
      },
    }),
  );
  const domain = shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const fullDomain =
    domain && !domain.endsWith(".myshopify.com") ? `${domain}.myshopify.com` : domain;
  const valid =
    channel === "shopify" ? /^[a-z0-9-]+\.myshopify\.com$/.test(fullDomain) : !!name.trim();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {preset
              ? t("channels.reconnectTitle", "Reconnect Shopify")
              : t("channels.connectTitle", "Connect a channel")}
          </DialogTitle>
          <DialogDescription>
            {channel === "shopify"
              ? t(
                  "channels.shopifyHint",
                  "You'll be sent to Shopify to approve access, then back here.",
                )
              : t(
                  "channels.csvHint",
                  "Orders come in from this marketplace's CSV export until its API is approved.",
                )}
          </DialogDescription>
        </DialogHeader>
        {!preset && (
          <Field label={t("channels.connection", "Channel")} htmlFor="cc-channel">
            <NativeSelect
              id="cc-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
            >
              {CONNECTABLE_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`channel.${c}`, c)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {channel === "shopify" ? (
          <Field
            label={t("channels.shopDomain", "Shop domain")}
            htmlFor="cc-shop"
            hint={fullDomain || "your-shop.myshopify.com"}
          >
            <Input
              id="cc-shop"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder="your-shop"
            />
          </Field>
        ) : (
          <Field label={t("channels.shopName", "Shop name")} htmlFor="cc-name">
            <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!valid || connect.isPending}
            onClick={() => {
              setError(null);
              connect.mutate(
                channel === "shopify"
                  ? { channel: "shopify", shopDomain: fullDomain }
                  : { channel, name: name.trim(), mode: "csv" },
              );
            }}
          >
            {connect.isPending && <Loader2 className="animate-spin" />}
            {channel === "shopify"
              ? t("channels.continueShopify", "Continue to Shopify")
              : t("action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionSettingsDialog({
  connection: c,
  onClose,
  onDone,
}: {
  connection: ChannelConnection;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [s, setS] = useState(c.settings);
  const [name, setName] = useState(c.name);
  const save = useMutation(
    orpc.channels.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("settings.saved", "Settings saved"));
        onDone();
        onClose();
      },
    }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{c.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("channels.shopName", "Shop name")}
            htmlFor="cs-name"
            className="col-span-2"
          >
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("channels.riskWindow", "At-risk window (hours)")} htmlFor="cs-risk">
            <Input
              id="cs-risk"
              type="number"
              min={1}
              value={s.riskWindowHours}
              onChange={(e) =>
                setS({ ...s, riskWindowHours: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </Field>
          <Field
            label={t("channels.processingDays", "Processing days")}
            htmlFor="cs-proc"
            hint={t("channels.processingHint", "When the channel sends no ship-by")}
          >
            <Input
              id="cs-proc"
              type="number"
              min={0}
              value={s.processingDays ?? ""}
              onChange={(e) =>
                setS({
                  ...s,
                  processingDays: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          {(
            [
              ["autoImport", t("channels.autoImport", "Import orders automatically")],
              ["pushTracking", t("channels.pushTracking", "Push tracking numbers")],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="col-span-2 flex items-center justify-between text-sm">
              {label}
              <Switch checked={s[k]} onCheckedChange={(v) => setS({ ...s, [k]: v })} />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() =>
              save.mutate({
                id: c.id,
                name: name.trim() || c.name,
                // The stock-push switch lives on the card; don't overwrite it from a stale copy.
                settings: {
                  autoImport: s.autoImport,
                  pushTracking: s.pushTracking,
                  riskWindowHours: s.riskWindowHours,
                  processingDays: s.processingDays,
                },
              })
            }
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

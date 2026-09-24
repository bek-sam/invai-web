import {
  type ChannelConnection,
  CONNECTABLE_CHANNELS,
  CSV_FORMATS,
  type ImportReport,
} from "@invai/contracts";
import {
  Badge,
  Button,
  Card,
  ChannelBadge,
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
import { FileUp, Loader2, Plug, Plus, RefreshCw, Settings2, Unplug } from "lucide-react";
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
import { useCan } from "../../../lib/me";
import { client, orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/settings/channels")({
  validateSearch: z.object({ import: z.boolean().optional().catch(undefined) }),
  component: ChannelsPage,
});

function ChannelsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/settings/channels" });
  const queryClient = useQueryClient();
  const q = useQuery(orpc.channels.list.queryOptions({ input: {} }));
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(!!search.import);
  const [importConn, setImportConn] = useState("");
  const [format, setFormat] = useState<(typeof CSV_FORMATS)[number]>("etsy");
  const [editing, setEditing] = useState<ChannelConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState<ChannelConnection | null>(null);
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
            <Card key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <ChannelBadge channel={c.channel} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.mode === "api" ? t("channels.api", "API") : t("channels.csv", "CSV import")}
                  {c.provider === "mock" && ` · ${t("channels.mock", "sandbox")}`}
                  {c.health.lastImportAt && (
                    <>
                      {" · "}
                      {t("channels.lastImport", "last import")}{" "}
                      <RelativeTime value={c.health.lastImportAt} />
                    </>
                  )}
                  {` · ${t("channels.orders24h", "{{n}} orders in 24h", { n: c.health.ordersLast24h })}`}
                </p>
                {c.health.lastError && <p className="text-xs text-danger">{c.health.lastError}</p>}
              </div>
              <Badge variant={c.health.ok ? "success" : "danger"}>
                {c.health.ok
                  ? t("channels.healthy", "Healthy")
                  : t("channels.unhealthy", "Needs attention")}
              </Badge>
              {c.health.pendingApproval && (
                <Badge variant="warning">
                  {t("channels.pendingApproval", "API pending approval")}
                </Badge>
              )}
              <div className="flex gap-1">
                {c.mode === "api" && can("channels.manage") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => sync.mutate({ id: c.id })}
                    disabled={sync.isPending}
                  >
                    <RefreshCw />
                    {t("channels.sync", "Sync")}
                  </Button>
                )}
                {can("channels.import") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setImportConn(c.id);
                      setFormat(
                        c.channel === "shopify"
                          ? "shopify"
                          : (CSV_FORMATS as readonly string[]).includes(c.channel)
                            ? (c.channel as never)
                            : "generic",
                      );
                      setImportOpen(true);
                    }}
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
                      onClick={() => setEditing(c)}
                      aria-label={t("nav.settings")}
                    >
                      <Settings2 />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-danger"
                      onClick={() => setDisconnecting(c)}
                      aria-label={t("channels.disconnect", "Disconnect")}
                    >
                      <Unplug />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {connectOpen && <ConnectDialog onClose={() => setConnectOpen(false)} onDone={invalidate} />}
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
          if (!o && search.import) void navigate({ search: {}, replace: true });
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
        renderReport={(r) => (
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
        )}
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

function ConnectDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<(typeof CONNECTABLE_CHANNELS)[number]>("shopify");
  const [shop, setShop] = useState("");
  const [name, setName] = useState("");
  const connect = useMutation(
    orpc.channels.connect.mutationOptions({
      onSuccess: (r) => {
        if (r.kind === "oauth") {
          window.location.href = r.authorizeUrl;
          return;
        }
        toast.success(t("channels.connected", "{{name}} added", { name: r.connection.name }));
        onDone();
        onClose();
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
          <DialogTitle>{t("channels.connectTitle", "Connect a channel")}</DialogTitle>
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!valid || connect.isPending}
            onClick={() =>
              connect.mutate(
                channel === "shopify"
                  ? { channel: "shopify", shopDomain: fullDomain }
                  : { channel, name: name.trim(), mode: "csv" },
              )
            }
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
              [
                "pushAvailability",
                t("channels.pushAvailability", "Pause listings when blanks run out"),
              ],
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
            onClick={() => save.mutate({ id: c.id, name: name.trim() || c.name, settings: s })}
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

import { type OrderItem, type OrderWithItems, PRE_SHIPPED_STATES } from "@invai/contracts";
import {
  Badge,
  Button,
  ChannelBadge,
  cn,
  Input,
  Money,
  RelativeTime,
  ShipByBadge,
  Skeleton,
  StatusBadge,
  toast,
} from "@invai/ui";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OrderStatusBadge } from "../../components/badges";
import { DefList, Section } from "../../components/page";
import { blankLabel } from "../../components/pickers";
import { SignedImage } from "../../components/signed-image";
import { ErrorState, SkeletonRows } from "../../components/states";
import { formatDateTime, orderLabel } from "../../lib/format";
import { useCan } from "../../lib/me";
import { orpc } from "../../lib/rpc";
import { OrderProfitBreakdown } from "../finance/order-profit";
import { CancelDialog, HoldDialog, MapItemDialog, useInvalidateOrders } from "./dialogs";
import {
  AddressSection,
  ItemActions,
  ItemFlags,
  OrderTags,
  ShipmentSection,
} from "./order-actions";
import { extractTimelineReason } from "./timeline-reason";

export function OrderDetail({
  orderId,
  inDrawer = false,
}: {
  orderId: string;
  inDrawer?: boolean;
}) {
  const { t } = useTranslation();
  const q = useQuery(orpc.orders.get.queryOptions({ input: { id: orderId } }));
  if (q.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16" />
        <SkeletonRows rows={4} />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const order = q.data;
  return (
    <div className="flex flex-col gap-4">
      <OrderHeader order={order} inDrawer={inDrawer} />
      <div className={cn("grid gap-4", !inDrawer && "lg:grid-cols-3")}>
        <div className={cn("flex flex-col gap-4", !inDrawer && "lg:col-span-2")}>
          <Section title={t("orders.items", "Items ({{count}})", { count: order.items.length })}>
            <ul className="-my-2 divide-y divide-border">
              {order.items.map((item) => (
                <ItemRow key={item.id} item={item} channel={order.channel} />
              ))}
            </ul>
          </Section>
          <Timeline orderId={order.id} />
        </div>
        <div className="flex flex-col gap-4">
          <AddressSection key={`${order.id}-${order.hold?.reason ?? ""}`} order={order} />
          <ShipmentSection orderId={order.id} />
          <Section title={t("orders.summary", "Summary")}>
            <DefList
              items={[
                [t("orders.placed", "Placed"), formatDateTime(order.placedAt)],
                [t("orders.shipBy", "Ship by"), formatDateTime(order.shipBy)],
                [t("orders.buyer", "Buyer"), order.buyerName],
                [
                  t("orders.shipTo", "Ship to"),
                  order.shipTo
                    ? `${order.shipTo.city}, ${order.shipTo.state} ${order.shipTo.zip}`
                    : "—",
                ],
                [t("orders.method", "Method"), order.shippingMethod ?? "—"],
                [t("orders.bin", "Bin"), order.binCode ?? "—"],
                [t("orders.subtotal", "Subtotal"), <Money key="s" cents={order.totals.subtotal} />],
                [
                  t("orders.shipping", "Shipping"),
                  <Money key="sh" cents={order.totals.shipping} />,
                ],
                [
                  t("orders.total", "Total"),
                  <Money key="t" cents={order.totals.total} className="font-semibold" />,
                ],
              ]}
            />
            {order.buyerNote && (
              <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
                <MessageSquare className="mr-1.5 inline size-3.5" />
                {order.buyerNote}
              </p>
            )}
          </Section>
          <ProfitSection orderId={order.id} />
        </div>
      </div>
    </div>
  );
}

function ProfitSection({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const can = useCan();
  const [open, setOpen] = useState(false);
  if (!can("finance.read")) return null;
  return (
    <Section
      title={t("orders.profit", "Profit")}
      actions={
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? t("action.close") : t("orders.showProfit", "Show")}
        </Button>
      }
    >
      {open ? (
        <OrderProfitBreakdown orderId={orderId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("orders.profitHint", "Fees, blanks, transfers, label and labor for this order.")}
        </p>
      )}
    </Section>
  );
}

function OrderHeader({ order, inDrawer }: { order: OrderWithItems; inDrawer: boolean }) {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateOrders();
  const [holdOpen, setHoldOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const release = useMutation(
    orpc.orders.release.mutationOptions({
      onSuccess: () => {
        toast.success(t("orders.releasedToast", "Order #{{no}} released", { no: order.orderNo }));
        void invalidate();
      },
    }),
  );
  const canCancel = order.items.some(
    (i) => (PRE_SHIPPED_STATES as readonly string[]).includes(i.state) || i.state === "on_hold",
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{orderLabel(order.orderNo)}</h2>
        <ChannelBadge channel={order.channel} />
        <OrderStatusBadge status={order.status} />
        {order.status !== "shipped" &&
          order.status !== "delivered" &&
          order.status !== "cancelled" && <ShipByBadge shipBy={order.shipBy} />}
        {order.isRush && (
          <Badge variant="danger">
            <Zap className="size-3" />
            {t("orders.rush", "Rush")}
          </Badge>
        )}
      </div>
      <OrderTags order={order} />
      {order.hold && (
        <p className="flex items-center gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <Pause className="size-4" />
          {t("orders.onHoldBecause", "On hold: {{reason}}", {
            reason: t(`holdReason.${order.hold.reason}`, order.hold.reason),
          })}
          {order.hold.note ? ` · ${order.hold.note}` : ""}
        </p>
      )}
      {order.cancel && (
        <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <Ban className="size-4" />
          {t("orders.cancelledBecause", "Cancelled: {{reason}}", {
            reason: t(`cancelReason.${order.cancel.reason}`, order.cancel.reason),
          })}
        </p>
      )}
      {can("orders.manage") && (
        <div className="flex flex-wrap gap-2">
          {order.hold ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => release.mutate({ id: order.id })}
              disabled={release.isPending}
            >
              {release.isPending ? <Loader2 className="animate-spin" /> : <Play />}
              {t("orders.release", "Release")}
            </Button>
          ) : (
            order.status !== "cancelled" &&
            order.status !== "shipped" &&
            order.status !== "delivered" && (
              <Button size="sm" variant="outline" onClick={() => setHoldOpen(true)}>
                <Pause />
                {t("orders.hold", "Hold")}
              </Button>
            )
          )}
          {canCancel && order.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              className="text-danger"
              onClick={() => setCancelOpen(true)}
            >
              <Ban />
              {t("orders.cancel", "Cancel")}
            </Button>
          )}
          {inDrawer && (
            <Button size="sm" variant="ghost" asChild>
              <Link to="/orders/$orderId" params={{ orderId: order.id }}>
                <ExternalLink />
                {t("orders.openPage", "Open page")}
              </Link>
            </Button>
          )}
        </div>
      )}
      <HoldDialog orderIds={[order.id]} open={holdOpen} onOpenChange={setHoldOpen} />
      {cancelOpen && <CancelDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} />}
    </div>
  );
}

function ItemRow({ item, channel }: { item: OrderItem; channel: string }) {
  const { t } = useTranslation();
  const can = useCan();
  const [mapOpen, setMapOpen] = useState(false);
  const design = useQuery(
    orpc.designs.get.queryOptions({
      input: { id: item.design?.id ?? "" },
      enabled: !!item.design,
      staleTime: 5 * 60_000,
    }),
  );
  const thumbKey = item.artwork.previewKey ?? design.data?.placements[0]?.previewKey ?? null;
  return (
    <li className="flex gap-3 py-3">
      <SignedImage
        fileKey={thumbKey}
        alt={item.design?.name ?? item.title}
        className="size-16 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.design?.name ?? item.title}</span>
          <StatusBadge state={item.state} />
          {item.isRush && <Badge variant="danger">{t("orders.rush", "Rush")}</Badge>}
          {item.isReprint && <Badge variant="warning">{t("orders.reprint", "Reprint")}</Badge>}
          <span className="text-xs text-muted-foreground">
            {t("orders.unit", "unit {{n}}/{{of}}", { n: item.unitNo, of: item.unitsInLine })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {item.blank ? blankLabel(item.blank) : (item.variantTitle ?? "—")}
          {item.placement ? ` · ${t(`placement.${item.placement}`, item.placement)}` : ""}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{item.channelSku}</p>
        <ItemFlags item={item} />
        {item.personalization.length > 0 && <PersonalizationProof item={item} />}
        {item.state === "needs_mapping" && can("orders.map") && (
          <Button size="sm" className="mt-2" onClick={() => setMapOpen(true)}>
            <Link2 />
            {t("orders.map", "Map item")}
          </Button>
        )}
        <ItemActions item={item} />
      </div>
      <div className="shrink-0 text-right text-sm">
        <Money cents={item.unitPrice} />
        {item.sheetId && (
          <Link
            to="/production/sheets/$sheetId"
            params={{ sheetId: item.sheetId }}
            className="mt-1 block text-xs text-primary hover:underline"
          >
            {t("orders.viewSheet", "View sheet")}
          </Link>
        )}
      </div>
      {mapOpen && (
        <MapItemDialog item={item} channel={channel} open={mapOpen} onOpenChange={setMapOpen} />
      )}
    </li>
  );
}

function PersonalizationProof({ item }: { item: OrderItem }) {
  const { t } = useTranslation();
  const can = useCan();
  const invalidate = useInvalidateOrders();
  const queryClient = useQueryClient();
  const approve = useMutation(
    orpc.personalization.artwork.approve.mutationOptions({
      onSuccess: () => {
        toast.success(t("orders.artworkApproved", "Artwork approved"));
        void invalidate();
        void queryClient.invalidateQueries({ queryKey: orpc.personalization.key() });
      },
    }),
  );
  const status = item.artwork.status;
  return (
    <div className="mt-2 rounded-md border border-border p-2">
      <div className="flex flex-wrap items-start gap-3">
        {item.artwork.previewKey && (
          <SignedImage
            fileKey={item.artwork.previewKey}
            alt={t("orders.proof", "Proof")}
            className="h-24 w-32"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
            {status === "flagged" ? (
              <AlertTriangle className="size-3.5 text-warning" />
            ) : status === "approved" ? (
              <CheckCircle2 className="size-3.5 text-success" />
            ) : null}
            {t("orders.personalization", "Personalization")} ·{" "}
            {t(`artworkStatus.${status}`, status)}
          </p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 text-xs">
            {item.personalization.map((p) => (
              <div key={p.question} className="contents">
                <dt className="text-muted-foreground">{p.question}</dt>
                <dd className="break-words font-medium">{p.answer ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
        {(status === "flagged" || status === "rendered") && can("artwork.approve") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => approve.mutate({ orderItemId: item.id })}
            disabled={approve.isPending}
          >
            {approve.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {t("orders.approveProof", "Approve proof")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Timeline({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const q = useInfiniteQuery(
    orpc.orders.timeline.infiniteOptions({
      input: (cursor: string | undefined) => ({ id: orderId, cursor, limit: 50 }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const add = useMutation(
    orpc.orders.addNote.mutationOptions({
      onSuccess: () => {
        setNote("");
        void queryClient.invalidateQueries({ queryKey: orpc.orders.timeline.key() });
      },
    }),
  );
  const entries = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Section title={t("orders.timeline", "Timeline")}>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) add.mutate({ id: orderId, text: note.trim() });
        }}
      >
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("orders.addNote", "Add a note…")}
        />
        <Button type="submit" size="sm" variant="outline" disabled={!note.trim() || add.isPending}>
          {t("orders.post", "Post")}
        </Button>
      </form>
      {q.isPending ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("orders.noTimeline", "No activity yet.")}
        </p>
      ) : (
        <ol className="relative ml-2 border-l border-border">
          {entries.map((e) => (
            <li key={e.id} className="relative pb-3 pl-4">
              <span
                className={cn(
                  "absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-background",
                  e.kind === "note"
                    ? "bg-info"
                    : e.kind === "held" || e.kind === "cancelled"
                      ? "bg-danger"
                      : "bg-muted-foreground",
                )}
              />
              <p className="text-sm">
                {e.kind === "state_changed" && e.to ? (
                  <>
                    <span className="inline-flex items-center gap-1 align-middle">
                      {e.from ? (
                        <StatusBadge state={e.from} className="scale-90" />
                      ) : (
                        <Badge variant="secondary" className="scale-90">
                          {t("orders.timelineNewState", "New")}
                        </Badge>
                      )}
                      <span aria-hidden="true">→</span>
                      <StatusBadge state={e.to} className="scale-90" />
                    </span>
                    {(() => {
                      const reason = extractTimelineReason(e.message, e.from, e.to);
                      if (reason.type === "reason") {
                        return <span className="ml-1 text-muted-foreground">({reason.text})</span>;
                      }
                      if (reason.type === "raw") {
                        return <span className="ml-1 text-muted-foreground">{reason.text}</span>;
                      }
                      return null;
                    })()}
                  </>
                ) : (
                  e.message
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {e.actor.name}
                {e.actor.station ? ` · ${t(`station.${e.actor.station}`)}` : ""} ·{" "}
                <RelativeTime value={e.at} />
              </p>
            </li>
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {t("action.loadMore")}
        </Button>
      )}
    </Section>
  );
}

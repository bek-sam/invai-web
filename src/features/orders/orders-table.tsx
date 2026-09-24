import type { Order } from "@invai/contracts";
import {
  Badge,
  ChannelBadge,
  Checkbox,
  cn,
  EmptyState,
  Money,
  ShipByBadge,
  Skeleton,
} from "@invai/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, Sparkles, Zap } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { OrderStatusBadge } from "../../components/badges";
import { useMediaQuery } from "../../hooks/use-media";
import { firstName, orderLabel } from "../../lib/format";

const COLS =
  "grid-cols-[2.25rem_6.5rem_minmax(7rem,1fr)_minmax(6rem,1fr)_4rem_7.5rem_minmax(8rem,1fr)_6rem]";

/**
 * The Order Hub table: virtualized rows, an active row driven by j/k, x to select, Enter
 * to open. Local rather than @invai/ui DataTable, which has no active-row or row-class API.
 */
export function OrdersTable({
  orders,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  selected,
  onSelectedChange,
  activeIndex,
  onActiveIndexChange,
  onOpen,
  emptyTitle,
}: {
  orders: Order[];
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  onOpen: (order: Order) => void;
  emptyTitle: string;
}) {
  const { t } = useTranslation();
  const isPhone = useMediaQuery("(max-width: 767px)");
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = isPhone ? 76 : 44;
  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer]);

  const items = virtualizer.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index ?? 0;
  useEffect(() => {
    if (hasMore && !isLoadingMore && orders.length > 0 && lastIndex >= orders.length - 10)
      onLoadMore();
  }, [lastIndex, hasMore, isLoadingMore, orders.length, onLoadMore]);

  useEffect(() => {
    if (activeIndex >= 0 && activeIndex < orders.length)
      virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, orders.length, virtualizer]);

  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {!isPhone && (
        <div
          className={cn(
            "grid items-center gap-2 border-b border-border bg-muted/60 px-3 text-xs font-medium text-muted-foreground",
            COLS,
            "h-9",
          )}
        >
          <Checkbox
            aria-label={t("orders.selectAll", "Select all")}
            checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
            onCheckedChange={(v) =>
              onSelectedChange(v ? new Set(orders.map((o) => o.id)) : new Set())
            }
          />
          <span>{t("orders.channel", "Channel")}</span>
          <span>{t("orders.order", "Order")}</span>
          <span>{t("orders.customer", "Customer")}</span>
          <span className="text-right">{t("orders.itemsCol", "Items")}</span>
          <span>{t("orders.shipBy", "Ship by")}</span>
          <span>{t("orders.state", "State")}</span>
          <span className="text-right">{t("orders.total", "Total")}</span>
        </div>
      )}
      <div
        ref={scrollRef}
        className="overflow-y-auto overscroll-contain"
        style={{
          height: isPhone ? "calc(100dvh - 17rem)" : "calc(100dvh - 15.5rem)",
          minHeight: 320,
        }}
      >
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 12 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            description={t("orders.emptyHint", "Try another view or clear the filters.")}
          />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((v) => {
              const o = orders[v.index];
              if (!o) return null;
              const isActive = v.index === activeIndex;
              const isSelected = selected.has(o.id);
              const common: React.HTMLAttributes<HTMLDivElement> = {
                "aria-current": isActive ? "true" : undefined,
                onClick: () => {
                  onActiveIndexChange(v.index);
                  onOpen(o);
                },
              };
              return (
                <div
                  key={o.id}
                  data-index={v.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: v.size,
                    transform: `translateY(${v.start}px)`,
                  }}
                  className={cn(
                    "cursor-pointer border-b border-border px-3 text-sm transition-colors hover:bg-muted/50",
                    isSelected && "bg-accent/70",
                    isActive && "shadow-[inset_3px_0_0_var(--color-primary)] bg-muted/60",
                  )}
                  {...common}
                >
                  {isPhone ? (
                    <div className="flex h-full items-center gap-3">
                      <Checkbox
                        aria-label={t("orders.select", "Select")}
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggle(o.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{orderLabel(o.orderNo)}</span>
                          {o.isRush && <Zap className="size-3.5 text-danger" />}
                          <span className="truncate text-muted-foreground">
                            {firstName(o.buyerName)}
                          </span>
                          <Money cents={o.totals.total} className="ml-auto" />
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <OrderStatusBadge status={o.status} />
                          <ShipByBadge shipBy={o.shipBy} />
                          <span className="ml-auto text-xs text-muted-foreground">
                            {t("orders.nItems", "{{count}} items", { count: o.itemCount })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={cn("grid h-full items-center gap-2", COLS)}>
                      <Checkbox
                        aria-label={t("orders.select", "Select")}
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggle(o.id)}
                      />
                      <span className="min-w-0">
                        <ChannelBadge channel={o.channel} className="max-w-full" />
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{orderLabel(o.orderNo)}</span>
                        {o.isRush && (
                          <Zap
                            className="size-3.5 shrink-0 text-danger"
                            aria-label={t("orders.rush", "Rush")}
                          />
                        )}
                        {o.hasPersonalization && (
                          <Sparkles
                            className="size-3.5 shrink-0 text-info"
                            aria-label={t("orders.personalized", "Personalized")}
                          />
                        )}
                      </span>
                      <span className="truncate">{firstName(o.buyerName)}</span>
                      <span className="text-right tabular-nums">{o.itemCount}</span>
                      <span>
                        {o.status === "shipped" ||
                        o.status === "delivered" ||
                        o.status === "cancelled" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <ShipByBadge shipBy={o.shipBy} />
                        )}
                      </span>
                      <span className="flex min-w-0 items-center gap-1">
                        <OrderStatusBadge status={o.status} />
                        {o.atRisk && o.status !== "on_hold" && (
                          <Badge variant="warning" className="px-1.5">
                            {t("orders.atRiskShort", "risk")}
                          </Badge>
                        )}
                      </span>
                      <span className="text-right">
                        <Money cents={o.totals.total} />
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}
      </div>
    </div>
  );
}

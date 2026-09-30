import { Button, cn, EmptyState, Skeleton } from "@invai/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, Compass, Construction, RotateCw, WifiOff } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { errorInfo } from "../lib/errors";

/** Error panel for a failed query. NOT_IMPLEMENTED gets a calm "coming soon" look. */
export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const info = errorInfo(error);
  // Retrying a no-access page just asks the same question and gets the same FORBIDDEN answer
  // (B-193): the button never helps here, so it doesn't show, even when the caller passed one.
  const canRetry = !!onRetry && info.code !== "FORBIDDEN";
  const Icon =
    info.code === "NOT_IMPLEMENTED"
      ? Construction
      : info.code === "NETWORK"
        ? WifiOff
        : AlertTriangle;
  const title =
    info.code === "NOT_IMPLEMENTED"
      ? t("errors.notImplementedTitle")
      : info.code === "FORBIDDEN"
        ? t("errors.forbiddenTitle")
        : info.code === "NETWORK"
          ? t("errors.networkTitle")
          : t("common.error");
  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {title}: {info.message}
        </span>
        {canRetry && (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            {t("action.retry")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div role="alert" className={cn("rounded-lg border border-border", className)}>
      <EmptyState
        icon={Icon}
        title={title}
        description={info.message}
        action={
          canRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCw />
              {t("action.retry")}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/**
 * Renders a query's loading, error and success states. Keeps the layout stable by
 * letting the caller pass a skeleton with the same shape as the content.
 */
export function QueryView<T>({
  query,
  skeleton,
  children,
  errorCompact,
}: {
  query: Pick<UseQueryResult<T>, "data" | "error" | "isPending" | "isError" | "refetch">;
  skeleton?: React.ReactNode;
  children: (data: T) => React.ReactNode;
  errorCompact?: boolean;
}) {
  if (query.isPending) return <>{skeleton ?? <SkeletonRows />}</>;
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} compact={errorCompact} />
    );
  return <>{children(query.data as T)}</>;
}

/** Router-level 404 for unknown URLs. */
export function NotFoundState() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <EmptyState
        icon={Compass}
        title={t("errors.pageNotFoundTitle")}
        description={t("errors.pageNotFoundDescription")}
        action={
          <Button asChild variant="outline">
            <a href="/">{t("errors.pageNotFoundAction")}</a>
          </Button>
        }
      />
    </div>
  );
}

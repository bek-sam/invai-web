import { Card, EmptyState, RelativeTime } from "@invai/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Page } from "../../../components/page";
import { ErrorState, SkeletonRows } from "../../../components/states";
import { formatInches } from "../../../lib/format";
import { orpc } from "../../../lib/rpc";

export const Route = createFileRoute("/_app/vendor/shops")({
  component: ShopsPage,
});

function ShopsPage() {
  const { t } = useTranslation();
  const q = useQuery(orpc.vendorPortal.shops.queryOptions({ input: {} }));
  return (
    <Page
      wide={false}
      title={t("nav.shops")}
      description={t("vendor.shopsSubtitle", "Shops that send you sheets.")}
    >
      {q.isPending ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Store}
            title={t("vendor.noShops", "No shops yet")}
            description={t(
              "vendor.noShopsHint",
              "Shops invite you from their InvAI vendor settings.",
            )}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.data.items.map((s) => (
            <Link
              key={s.orgId}
              to="/vendor"
              search={{ shop: s.orgId, tab: "all" }}
              className="rounded-lg border border-border bg-card p-4 hover:shadow-md"
            >
              <p className="font-medium">{s.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "vendor.shopStats",
                  "{{open}} open · {{total}} sheets total · {{inches}} in 30 days",
                  {
                    open: s.sheetsOpen,
                    total: s.sheetsTotal,
                    inches: formatInches(s.inchesLast30d, 0),
                  },
                )}
              </p>
              {s.lastSheetAt && (
                <p className="text-xs text-muted-foreground">
                  {t("vendor.lastSheet", "Last sheet")} <RelativeTime value={s.lastSheetAt} />
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

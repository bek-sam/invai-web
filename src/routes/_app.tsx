import type { Me } from "@invai/contracts";
import { Button } from "@invai/ui";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppFrame } from "../components/app-frame";
import { ErrorState } from "../components/states";
import { authClient } from "../lib/auth";
import { isUnauthorized } from "../lib/errors";
import { meQueryOptions } from "../lib/me";
import { ensureActiveOrg } from "../lib/session";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const toLogin = () => redirect({ to: "/login", search: { redirect: location.href } });
    let me: Me;
    try {
      me = await context.queryClient.ensureQueryData(meQueryOptions());
    } catch (err) {
      if (!isUnauthorized(err)) throw err;
      // A valid session with no active organization also yields 401; pick one and retry once.
      // Only a definite "no session" sends the user to sign in; a network blip (API restarting)
      // shows the error screen with a retry instead of logging them out.
      const session = await authClient.getSession().catch(() => undefined);
      if (!session || session.error) throw err;
      if (!session.data) throw toLogin();
      await ensureActiveOrg();
      try {
        me = await context.queryClient.fetchQuery(meQueryOptions());
      } catch (e2) {
        if (isUnauthorized(e2)) throw toLogin();
        throw e2;
      }
    }
    const path = location.pathname;
    const inVendor = path === "/vendor" || path.startsWith("/vendor/");
    const shared = path.startsWith("/settings/company") || path.startsWith("/settings/team");
    if (me.org.type === "vendor" && !inVendor && !shared) throw redirect({ to: "/vendor" });
    if (me.org.type === "shop" && inVendor) throw redirect({ to: "/" });
    return { me };
  },
  component: AppLayout,
  errorComponent: AppError,
});

function AppLayout() {
  return (
    <AppFrame>
      <Outlet />
    </AppFrame>
  );
}

function AppError({ error, reset }: { error: unknown; reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md">
        <ErrorState error={error} onRetry={reset} />
        <div className="mt-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await authClient.signOut().catch(() => undefined);
              window.location.href = "/login";
            }}
          >
            {t("action.logOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}

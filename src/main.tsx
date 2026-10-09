import { toast } from "@invai/ui";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorState, NotFoundState } from "./components/states";
import { isMfaRequired, MFA_REQUIRED_CODE } from "./features/account/mfa";
import { initAppI18n } from "./i18n";
import { errorInfo, shouldRetry } from "./lib/errors";
import { initTheme } from "./lib/theme";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { silent?: boolean; errorTitle?: string };
  }
}

// These codes already open their own dialog (UpgradePromptHost, VerifyEmailBanner) that explains
// the problem and offers the fix; a second, generic toast would just repeat it.
const DIALOG_EXPLAINED_CODES = new Set([
  "PLAN_LIMIT_REACHED",
  "PAYMENT_REQUIRED",
  "CREDITS_EXHAUSTED",
  "EMAIL_NOT_VERIFIED",
  // The setup page ("Turn on two-step sign-in") takes over; see goToMfaSetup below.
  MFA_REQUIRED_CODE,
  // The rates dialog (T-23-1, B-25) shows its own inline "rates changed" notice and re-fetches;
  // a second generic toast would just repeat it.
  "RATE_EXPIRED",
]);

// Any call answering MFA_REQUIRED sends the person to the setup page, once, and back after.
function goToMfaSetup(error: unknown) {
  if (!isMfaRequired(error)) return;
  const here = router.state.location;
  if (here.pathname === "/setup-two-step") return;
  void router.navigate({ to: "/setup-two-step", search: { redirect: here.href } });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: true },
  },
  queryCache: new QueryCache({ onError: goToMfaSetup }),
  // Every failed mutation gets a toast unless it opts out and shows the error inline, or a
  // dialog already explains it (see DIALOG_EXPLAINED_CODES).
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      goToMfaSetup(error);
      if (mutation.meta?.silent) return;
      const info = errorInfo(error);
      if (DIALOG_EXPLAINED_CODES.has(info.code)) return;
      toast.error(mutation.meta?.errorTitle ?? info.message, {
        description: mutation.meta?.errorTitle ? info.message : undefined,
      });
    },
  }),
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: ({ error, reset }) => (
    <div className="p-6">
      <ErrorState error={error} onRetry={reset} />
    </div>
  ),
  defaultNotFoundComponent: NotFoundState,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

initTheme();

void initAppI18n().then(() => {
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    );
  }
});

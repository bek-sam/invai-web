import { Button } from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { mfaReturnTarget } from "../features/account/mfa";
import { useAuthSession } from "../features/account/session";
import { TwoFactorSection } from "../features/account/two-factor-section";
import { useResend } from "../features/account/verify-email-banner";
import { authClient } from "../lib/auth";
import { meQueryOptions } from "../lib/me";

export const Route = createFileRoute("/setup-two-step")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: SetupTwoStepPage,
});

/**
 * Where owners and admins land once the grace period for two-step sign-in is over (or the API
 * answered MFA_REQUIRED). Outside `_app`, so it never redirects to itself. It leaves only after
 * the person's own account shows two-step sign-in on, so a stale `me` cannot cause a loop.
 */
function SetupTwoStepPage() {
  const { t } = useTranslation();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, isPending } = useAuthSession();
  const { resend, pending: resending } = useResend();
  const [continuing, setContinuing] = useState(false);

  if (isPending) {
    return (
      <AuthLayout title={t("mfaSetup.title", "Turn on two-step sign-in")}>
        <div role="status" className="flex justify-center py-4">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </AuthLayout>
    );
  }
  if (!session) return <Navigate to="/login" search={{ redirect: "/" }} />;

  const user = session.user;
  const on = user.twoFactorEnabled === true;

  async function signOut() {
    await authClient.signOut().catch(() => undefined);
    window.location.href = "/login";
  }

  async function onContinue() {
    setContinuing(true);
    try {
      // Fresh `me` first (exempt from the check), then every query that was refused retries.
      await queryClient.fetchQuery({ ...meQueryOptions(), staleTime: 0 });
      await queryClient.invalidateQueries();
      await navigate({ to: mfaReturnTarget(redirect) });
    } finally {
      setContinuing(false);
    }
  }

  return (
    <AuthLayout
      title={t("mfaSetup.title", "Turn on two-step sign-in")}
      subtitle={t(
        "mfaSetup.subtitle",
        "Owners and admins must use two-step sign-in. It takes about a minute.",
      )}
      footer={
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => void signOut()}
        >
          {t("mfaSetup.signOut", "Sign out")}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {!on && !user.emailVerified && (
          <div role="alert" className="flex flex-col gap-2 text-sm">
            <p>
              {t(
                "mfaSetup.needsEmail",
                "Confirm your email first. We sent a link to {{email}}. Then come back and turn on two-step sign-in.",
                { email: user.email },
              )}
            </p>
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={resending}
                onClick={() => void resend(user.email)}
              >
                {resending && <Loader2 className="animate-spin" />}
                {t("mfaSetup.resend", "Resend verification email")}
              </Button>
            </div>
          </div>
        )}
        <TwoFactorSection user={user} />
        {on && (
          <Button disabled={continuing} onClick={() => void onContinue()} className="w-full">
            {continuing && <Loader2 className="animate-spin" />}
            {t("mfaSetup.continue", "Continue to InvAI")}
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}

import { Button } from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { authErrorMessage } from "../features/account/auth-errors";
import { authSessionQueryOptions, useAuthSession } from "../features/account/session";
import { authClient } from "../lib/auth";

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: VerifyEmailPage,
});

type Outcome = { ok: true } | { ok: false; code: string | null; status: number | null };

async function verify(token: string): Promise<Outcome> {
  const res = await authClient.verifyEmail({ query: { token } });
  if (res.error)
    return { ok: false, code: res.error.code ?? null, status: res.error.status ?? null };
  return { ok: true };
}

function VerifyEmailPage() {
  const { t } = useTranslation();
  const { token } = Route.useSearch();
  const queryClient = useQueryClient();
  // A query, not an effect: it runs once per token even under StrictMode.
  const result = useQuery({
    queryKey: ["auth", "verify-email", token],
    queryFn: () => verify(token ?? ""),
    enabled: !!token,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const { session } = useAuthSession();
  const signedIn = !!session?.user;
  const verified = result.data?.ok === true;

  useEffect(() => {
    if (verified)
      void queryClient.invalidateQueries({ queryKey: authSessionQueryOptions().queryKey });
  }, [verified, queryClient]);

  if (token && result.isPending) {
    return (
      <AuthLayout title={t("verifyEmail.checking", "Confirming your email…")}>
        <div role="status" className="flex justify-center py-4">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </AuthLayout>
    );
  }

  const next = signedIn ? (
    <Button asChild className="w-full">
      <Link to="/">{t("verifyEmail.goToApp", "Go to InvAI")}</Link>
    </Button>
  ) : (
    <Button asChild className="w-full">
      <Link to="/login">{t("auth.signIn", "Sign in")}</Link>
    </Button>
  );

  if (verified) {
    return (
      <AuthLayout title={t("verifyEmail.doneTitle", "Your email is confirmed")}>
        <div role="status" className="flex flex-col gap-4 text-sm">
          <CircleCheck className="size-8 text-success" aria-hidden />
          <p>{t("verifyEmail.doneBody", "Thanks. You can now buy labels and choose a plan.")}</p>
          {next}
        </div>
      </AuthLayout>
    );
  }

  const outcome = result.data;
  const failCode = outcome && !outcome.ok ? outcome.code : null;
  const expired = !token || failCode === "TOKEN_EXPIRED" || failCode === "INVALID_TOKEN";
  const message = expired
    ? t(
        "verifyEmail.expiredBody",
        "This link has expired or isn't complete. Links work for 24 hours. Sign in and send a new one from the banner at the top.",
      )
    : authErrorMessage(
        outcome && !outcome.ok
          ? { code: outcome.code, status: outcome.status }
          : (result.error as Error),
        t,
      );
  return (
    <AuthLayout title={t("verifyEmail.failTitle", "We couldn't confirm your email")}>
      <div role="alert" className="flex flex-col gap-4 text-sm">
        <CircleX className="size-8 text-danger" aria-hidden />
        <p>{message}</p>
        {next}
      </div>
    </AuthLayout>
  );
}

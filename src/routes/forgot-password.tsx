import { Button, Input } from "@invai/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { Field } from "../components/page";
import { authErrorMessage } from "../features/account/auth-errors";
import { authClient } from "../lib/auth";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: z.object({ email: z.string().optional() }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      // The answer is the same whether or not the email has an account.
      const res = await authClient.requestPasswordReset({ email });
      if (res.error) setError(authErrorMessage(res.error, t));
      else setSent(true);
    } catch (err) {
      setError(authErrorMessage(err as Error, t));
    } finally {
      setPending(false);
    }
  }

  const footer = (
    <Link to="/login" className="font-medium text-primary hover:underline">
      {t("auth.backToSignIn", "Back to sign in")}
    </Link>
  );

  if (sent) {
    return (
      <AuthLayout title={t("auth.checkInbox", "Check your inbox")} footer={footer}>
        <div role="status" className="flex flex-col gap-3 text-sm">
          <MailCheck className="size-8 text-success" aria-hidden />
          <p>
            {t(
              "auth.resetSent",
              "If that email has an account, we sent a link to set a new password. It works for 1 hour.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t("auth.resetSpam", "Nothing after a few minutes? Check your spam folder.")}
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.forgotTitle", "Forgot your password?")}
      subtitle={t(
        "auth.forgotSubtitle",
        "Enter your email and we'll send you a link to set a new one.",
      )}
      footer={footer}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t("auth.email", "Email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="animate-spin" />}
          {t("auth.sendLink", "Send link")}
        </Button>
      </form>
    </AuthLayout>
  );
}

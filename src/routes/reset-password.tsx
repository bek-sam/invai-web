import { Button, Input } from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { Field } from "../components/page";
import { authErrorMessage } from "../features/account/auth-errors";
import { authClient } from "../lib/auth";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = Route.useSearch();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(!token);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const footer = (
    <Link to="/login" className="font-medium text-primary hover:underline">
      {t("auth.backToSignIn", "Back to sign in")}
    </Link>
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("authError.passwordShort", "Use at least 8 characters."));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsDiffer", "The two passwords don't match."));
      return;
    }
    if (!token) return;
    setPending(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) {
        if (res.error.code === "INVALID_TOKEN" || res.error.code === "TOKEN_EXPIRED") {
          setLinkDead(true);
        } else setError(authErrorMessage(res.error, t));
        return;
      }
      // Every session was signed out, this browser's too.
      queryClient.clear();
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err as Error, t));
    } finally {
      setPending(false);
    }
  }

  if (linkDead) {
    return (
      <AuthLayout title={t("auth.linkDeadTitle", "This link doesn't work anymore")} footer={footer}>
        <div role="alert" className="flex flex-col gap-4 text-sm">
          <p>
            {t(
              "auth.linkDeadBody",
              "Reset links work once, for 1 hour. Ask for a new one and use the newest email.",
            )}
          </p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">{t("auth.newLink", "Send me a new link")}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title={t("auth.passwordSet", "Your new password is set")}>
        <div role="status" className="flex flex-col gap-4 text-sm">
          <CircleCheck className="size-8 text-success" aria-hidden />
          <p>
            {t(
              "auth.passwordSetBody",
              "For your safety we signed you out everywhere. Sign in with the new password.",
            )}
          </p>
          <Button asChild className="w-full">
            <Link to="/login">{t("auth.signIn", "Sign in")}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.resetTitle", "Set a new password")}
      subtitle={t("auth.resetSubtitle", "Use at least 8 characters. You'll sign in again after.")}
      footer={footer}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label={t("auth.newPassword", "New password")} htmlFor="new-password">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label={t("auth.confirmPassword", "Type it again")} htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="animate-spin" />}
          {t("auth.setPassword", "Set new password")}
        </Button>
      </form>
    </AuthLayout>
  );
}

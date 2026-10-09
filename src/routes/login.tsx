import { Button, Input } from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { Field } from "../components/page";
import {
  authErrorMessage,
  isAccountLocked,
  isChallengeOver,
} from "../features/account/auth-errors";
import { setLang } from "../i18n";
import { authClient } from "../lib/auth";
import { ensureActiveOrg } from "../lib/session";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});

type Step = "password" | "totp" | "backup";

function LoginPage() {
  const { t } = useTranslation();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);

  async function finish() {
    // The saved language follows the person to every device (the account page and menu set it).
    const session = await authClient.getSession().catch(() => null);
    const locale = session?.data?.user.locale;
    if (locale === "en" || locale === "es") await setLang(locale);
    await ensureActiveOrg();
    queryClient.clear();
    const target = redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
    await navigate({ to: target });
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setLocked(false);
    try {
      // The Retry-After header backs up the body's retryAfterSec when the lock answer lacks it.
      let retryAfter: string | null = null;
      const res = await authClient.signIn.email(
        { email, password },
        {
          onError: (ctx) => {
            retryAfter = ctx.response.headers.get("Retry-After");
          },
        },
      );
      if (res.error) {
        setLocked(isAccountLocked(res.error.code));
        setError(
          authErrorMessage(
            res.error,
            t,
            t("auth.badCredentials", "Email or password is wrong"),
            retryAfter,
          ),
        );
        return;
      }
      if (res.data && "twoFactorRedirect" in res.data && res.data.twoFactorRedirect) {
        setCode("");
        setStep("totp");
        return;
      }
      await finish();
    } catch (err) {
      setError(authErrorMessage(err as Error, t));
    } finally {
      setPending(false);
    }
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const clean = step === "totp" ? code.replace(/\s/g, "") : code.trim();
      const res =
        step === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: clean })
          : await authClient.twoFactor.verifyBackupCode({ code: clean });
      if (res.error) {
        setError(authErrorMessage(res.error, t));
        if (isChallengeOver(res.error.code)) {
          setStep("password");
          setPassword("");
        }
        return;
      }
      await finish();
    } catch (err) {
      setError(authErrorMessage(err as Error, t));
    } finally {
      setPending(false);
    }
  }

  const alert = error && (
    <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
      {locked && (
        <>
          {" "}
          <Link
            to="/forgot-password"
            search={email ? { email } : {}}
            className="font-medium underline"
          >
            {t("auth.resetToUnlock", "Open password reset")}
          </Link>
        </>
      )}
    </p>
  );

  if (step !== "password") {
    const totp = step === "totp";
    return (
      <AuthLayout
        title={t("auth.mfaTitle", "Two-step sign-in")}
        subtitle={
          totp
            ? t("auth.mfaSubtitle", "Enter the 6-digit code from your authenticator app.")
            : t("auth.backupSubtitle", "Enter one of the backup codes you saved. Each works once.")
        }
        footer={
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              setStep("password");
              setPassword("");
              setError(null);
            }}
          >
            {t("auth.startOver", "Back to sign in")}
          </button>
        }
      >
        <form onSubmit={onCode} className="flex flex-col gap-4">
          <Field
            label={totp ? t("auth.mfaCode", "6-digit code") : t("auth.backupCode", "Backup code")}
            htmlFor="code"
          >
            <Input
              id="code"
              key={step}
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode={totp ? "numeric" : "text"}
              pattern={totp ? "[0-9 ]{6,7}" : undefined}
              maxLength={totp ? 7 : 32}
              className={totp ? "text-center font-mono text-lg tracking-[0.3em]" : "font-mono"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          {alert}
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <Loader2 className="animate-spin" />}
            {t("auth.verify", "Verify")}
          </Button>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => {
              setStep(totp ? "backup" : "totp");
              setCode("");
              setError(null);
            }}
          >
            {totp
              ? t("auth.useBackup", "Lost your phone? Use a backup code")
              : t("auth.useApp", "Use the code from your app")}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.signInTitle", "Sign in")}
      subtitle={t("auth.signInSubtitle", "Welcome back. Orders are waiting.")}
      footer={
        <>
          {t("auth.noAccount", "New to InvAI?")}{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            {t("auth.createCompany", "Create a company")}
          </Link>
        </>
      }
    >
      <form onSubmit={onPassword} className="flex flex-col gap-4">
        <Field label={t("auth.email", "Email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              {t("auth.password", "Password")}
            </label>
            <Link
              to="/forgot-password"
              search={email ? { email } : {}}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("auth.forgot", "Forgot password?")}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {alert}
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="animate-spin" />}
          {t("auth.signIn", "Sign in")}
        </Button>
      </form>
    </AuthLayout>
  );
}

import { Button, Input } from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { Field } from "../components/page";
import { authClient } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { ensureActiveOrg } from "../lib/session";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error)
        throw new Error(
          res.error.message || t("auth.badCredentials", "Email or password is wrong"),
        );
      await ensureActiveOrg();
      queryClient.clear();
      const target = redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
      await navigate({ to: target });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
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
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
        <Field label={t("auth.password", "Password")} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="animate-spin" />}
          {t("auth.signIn", "Sign in")}
        </Button>
      </form>
    </AuthLayout>
  );
}

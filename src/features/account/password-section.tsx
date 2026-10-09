import { Button, Input, toast } from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Section } from "../../components/page";
import { authClient } from "../../lib/auth";
import { authErrorMessage } from "./auth-errors";
import { sessionsQueryKey } from "./sessions-section";

export function PasswordSection({ email }: { email: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reused, setReused] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReused(null);
    if (next.length < 8) {
      setError(t("authError.passwordShort", "Use at least 8 characters."));
      return;
    }
    if (next !== confirm) {
      setError(t("auth.passwordsDiffer", "The two passwords don't match."));
      return;
    }
    setPending(true);
    try {
      // The server always signs the other devices out.
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        // Shown next to the new-password field, where the fix is.
        if (res.error.code === "PASSWORD_REUSED") setReused(authErrorMessage(res.error, t));
        else setError(authErrorMessage(res.error, t));
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      toast.success(
        t("account.passwordChanged", "Password changed. Your other devices were signed out."),
      );
    } catch (err) {
      setError(authErrorMessage(err as Error, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <Section
      title={t("account.password", "Password")}
      description={t("account.passwordHint", "Changing it signs you out on every other device.")}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        {/* Lets password managers pair the new password with this account. */}
        <input type="email" autoComplete="username" value={email} hidden readOnly />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("account.currentPassword", "Current password")} htmlFor="pw-current">
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field
            label={t("auth.newPassword", "New password")}
            htmlFor="pw-new"
            error={reused && <span role="alert">{reused}</span>}
          >
            <Input
              id="pw-new"
              aria-invalid={reused ? true : undefined}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label={t("auth.confirmPassword", "Type it again")} htmlFor="pw-confirm">
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={pending || !current || !next}>
            {pending && <Loader2 className="animate-spin" />}
            {t("account.changePassword", "Change password")}
          </Button>
        </div>
      </form>
    </Section>
  );
}

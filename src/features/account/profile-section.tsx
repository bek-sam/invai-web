import { Button, Input, toast } from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, NativeSelect, Section } from "../../components/page";
import { setLang } from "../../i18n";
import { authClient } from "../../lib/auth";
import { meQueryOptions } from "../../lib/me";
import { authErrorMessage } from "./auth-errors";
import { type AppLocale, type AuthUser, authSessionQueryOptions, toLocale } from "./session";

/** Name and language. The language is also the language of account and invite emails. */
export function ProfileSection({ user }: { user: AuthUser }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [locale, setLocale] = useState<AppLocale>(toLocale(user.locale));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== user.name || locale !== toLocale(user.locale);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("account.nameRequired", "Enter your name."));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await authClient.updateUser({ name: name.trim(), locale });
      if (res.error) {
        setError(authErrorMessage(res.error, t));
        return;
      }
      await setLang(locale);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: authSessionQueryOptions().queryKey }),
        queryClient.invalidateQueries({ queryKey: meQueryOptions().queryKey }),
      ]);
      // After a language change, confirm in the new language.
      toast.success(i18n.t("account.saved", "Saved"));
    } catch (err) {
      setError(authErrorMessage(err as Error, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <Section
      title={t("account.profile", "Profile")}
      description={t("account.profileHint", "How you appear to your team.")}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("auth.yourName", "Your name")} htmlFor="acc-name">
            <Input
              id="acc-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("auth.email", "Email")} htmlFor="acc-email">
            <Input id="acc-email" value={user.email} readOnly disabled />
          </Field>
          <Field
            label={t("account.language", "Language")}
            htmlFor="acc-lang"
            hint={t("account.languageHint", "For the app and the emails we send you.")}
          >
            <NativeSelect
              id="acc-lang"
              value={locale}
              onChange={(e) => setLocale(toLocale(e.target.value))}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </NativeSelect>
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={pending || !dirty}>
            {pending && <Loader2 className="animate-spin" />}
            {t("action.save", "Save")}
          </Button>
        </div>
      </form>
    </Section>
  );
}

import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, Section } from "../../components/page";
import { authClient } from "../../lib/auth";
import { meQueryOptions } from "../../lib/me";
import { authErrorMessage } from "./auth-errors";
import { canTurnOffMfa } from "./mfa";
import { type AuthUser, authSessionQueryOptions, totpSecret } from "./session";

type Mode = "enable" | "disable" | "codes";
type Step =
  | { kind: "password" }
  | { kind: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[] };

/** Optional two-step sign-in with an authenticator app, plus one-time backup codes. */
export function TwoFactorSection({ user }: { user: AuthUser }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode | null>(null);
  const on = user.twoFactorEnabled === true;
  // Owners and admins can't turn it off. The setup page has `me` too (the call is exempt).
  const { data: me } = useQuery(meQueryOptions());
  const mustKeep = !canTurnOffMfa(me?.mfa);
  return (
    <Section
      title={t("account.mfa", "Two-step sign-in")}
      description={t(
        "account.mfaHint",
        "After your password, sign-in also asks for a code from an app on your phone.",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {on ? (
            <>
              <ShieldCheck className="size-5 text-success" aria-hidden />
              <Badge variant="success">{t("account.mfaOn", "On")}</Badge>
              <span className="text-muted-foreground">
                {t("account.mfaOnHint", "Your account asks for a code at every new sign-in.")}
              </span>
            </>
          ) : (
            <>
              <ShieldOff className="size-5 text-muted-foreground" aria-hidden />
              <Badge variant="outline">{t("account.mfaOff", "Off")}</Badge>
              <span className="text-muted-foreground">
                {t(
                  "account.mfaOffHint",
                  "Turn it on to keep your shop safe if your password leaks.",
                )}
              </span>
            </>
          )}
        </div>
        {on && mustKeep && (
          <p className="text-sm text-muted-foreground" role="note">
            {t("account.mfaMustStay", "Owners and admins must keep two-step sign-in on.")}
          </p>
        )}
        {!on && !user.emailVerified && (
          <p className="text-sm text-warning-foreground dark:text-warning" role="note">
            {t(
              "account.mfaNeedsEmail",
              "Confirm your email first. Use the link we sent you, or send a new one from the banner at the top.",
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {on ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setMode("codes")}>
                {t("account.newCodes", "New backup codes")}
              </Button>
              {!mustKeep && (
                <Button size="sm" variant="outline" onClick={() => setMode("disable")}>
                  {t("account.mfaTurnOff", "Turn off")}
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" disabled={!user.emailVerified} onClick={() => setMode("enable")}>
              {t("account.mfaTurnOn", "Turn on")}
            </Button>
          )}
        </div>
      </div>
      {mode && <TwoFactorDialog mode={mode} onClose={() => setMode(null)} />}
    </Section>
  );
}

function TwoFactorDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refreshSession = () =>
    queryClient.invalidateQueries({ queryKey: authSessionQueryOptions().queryKey });

  async function run(fn: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(authErrorMessage(err as Error, t));
    } finally {
      setPending(false);
    }
  }

  const onPassword = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (mode === "enable") {
        const res = await authClient.twoFactor.enable({ password });
        if (res.error || !res.data) return setError(authErrorMessage(res.error, t));
        // We only use the authenticator-app method, which returns the URI and codes.
        if (!("totpURI" in res.data)) return setError(authErrorMessage(null, t));
        setStep({ kind: "scan", totpURI: res.data.totpURI, backupCodes: res.data.backupCodes });
      } else if (mode === "disable") {
        const res = await authClient.twoFactor.disable({ password });
        if (res.error) return setError(authErrorMessage(res.error, t));
        await refreshSession();
        toast.success(t("account.mfaOffDone", "Two-step sign-in is off."));
        onClose();
      } else {
        const res = await authClient.twoFactor.generateBackupCodes({ password });
        if (res.error || !res.data) return setError(authErrorMessage(res.error, t));
        setStep({ kind: "codes", backupCodes: res.data.backupCodes });
      }
      setPassword("");
    });
  };

  const onCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "scan") return;
    void run(async () => {
      const res = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
      if (res.error) return setError(authErrorMessage(res.error, t));
      await refreshSession();
      setStep({ kind: "codes", backupCodes: step.backupCodes });
    });
  };

  // Once two-step sign-in is on, closing before saving the codes is allowed but the codes are gone.
  const finishing = step.kind === "codes";
  const title =
    mode === "disable"
      ? t("account.mfaOffTitle", "Turn off two-step sign-in?")
      : mode === "codes" && !finishing
        ? t("account.newCodesTitle", "Make new backup codes")
        : finishing
          ? t("account.codesTitle", "Save your backup codes")
          : t("account.mfaSetupTitle", "Turn on two-step sign-in");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {step.kind === "password" && (
            <DialogDescription>
              {mode === "disable"
                ? t(
                    "account.mfaOffBody",
                    "Sign-in will only need your password. Enter it to confirm.",
                  )
                : mode === "codes"
                  ? t(
                      "account.newCodesBody",
                      "Your old backup codes stop working. Enter your password to continue.",
                    )
                  : t("account.confirmPasswordBody", "Enter your password to continue.")}
            </DialogDescription>
          )}
        </DialogHeader>

        {step.kind === "password" && (
          <form onSubmit={onPassword} className="flex flex-col gap-4">
            <Field label={t("auth.password", "Password")} htmlFor="mfa-password">
              <Input
                id="mfa-password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("action.cancel", "Cancel")}
              </Button>
              <Button
                type="submit"
                variant={mode === "disable" ? "destructive" : "default"}
                disabled={pending || !password}
              >
                {pending && <Loader2 className="animate-spin" />}
                {mode === "disable"
                  ? t("account.mfaTurnOff", "Turn off")
                  : t("action.next", "Next")}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.kind === "scan" && (
          <form onSubmit={onCode} className="flex flex-col gap-4">
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
              <li>
                {t(
                  "account.scanStep1",
                  "Open an authenticator app (Google Authenticator, 1Password, Authy…).",
                )}
              </li>
              <li>{t("account.scanStep2", "Scan this code, or type the key below.")}</li>
              <li>{t("account.scanStep3", "Enter the 6-digit code the app shows.")}</li>
            </ol>
            <div className="flex justify-center">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG
                  value={step.totpURI}
                  size={176}
                  title={t("account.qrLabel", "QR code for your authenticator app")}
                />
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground">
              {t("account.setupKey", "Setup key")}
              <div className="mt-1 font-mono text-sm break-all text-foreground select-all">
                {totpSecret(step.totpURI) ?? "—"}
              </div>
            </div>
            <Field label={t("auth.mfaCode", "6-digit code")} htmlFor="mfa-code">
              <Input
                id="mfa-code"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={7}
                className="text-center font-mono text-lg tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("action.cancel", "Cancel")}
              </Button>
              <Button type="submit" disabled={pending || code.replace(/\s/g, "").length < 6}>
                {pending && <Loader2 className="animate-spin" />}
                {t("account.mfaActivate", "Turn on")}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.kind === "codes" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {mode === "enable" && (
                <span className="font-medium">
                  {t("account.mfaOnDone", "Two-step sign-in is on.")}{" "}
                </span>
              )}
              {t(
                "account.codesBody",
                "If you lose your phone, each of these codes signs you in once. Keep them somewhere safe. We won't show them again.",
              )}
            </p>
            <BackupCodes codes={step.backupCodes} />
            <div className="flex items-center gap-2">
              <Checkbox
                id="codes-saved"
                checked={saved}
                onCheckedChange={(v) => setSaved(v === true)}
              />
              <label htmlFor="codes-saved" className="text-sm">
                {t("account.codesSaved", "I saved my backup codes")}
              </label>
            </div>
            <DialogFooter>
              <Button disabled={!saved} onClick={onClose}>
                {t("account.done", "Done")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const { t } = useTranslation();
  const text = codes.join("\n");
  return (
    <div className="flex flex-col gap-2">
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm"
        aria-label={t("account.codesList", "Backup codes")}
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast.success(t("account.codesCopied", "Codes copied"));
            } catch {
              toast.error(
                t("account.copyFailed", "Couldn't copy. Select the codes and copy them."),
              );
            }
          }}
        >
          <Copy /> {t("account.copy", "Copy")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([`InvAI backup codes\n\n${text}\n`], { type: "text/plain" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "invai-backup-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> {t("account.download", "Download")}
        </Button>
      </div>
    </div>
  );
}

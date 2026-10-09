import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@invai/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MailWarning } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "../../lib/auth";
import { authErrorMessage } from "./auth-errors";
import { authSessionQueryOptions, useAuthSession } from "./session";

/** The server refused a paid action (label buy, checkout) because the email isn't confirmed. */
function isEmailNotVerified(err: unknown): boolean {
  return (
    !!err && typeof err === "object" && (err as { code?: unknown }).code === "EMAIL_NOT_VERIFIED"
  );
}

/** Sends a new confirmation link; returns true when it went out. */
export function useResend() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  async function resend(email: string) {
    setPending(true);
    try {
      const res = await authClient.sendVerificationEmail({ email });
      if (res.error) {
        if (res.error.code === "EMAIL_ALREADY_VERIFIED") {
          await queryClient.invalidateQueries({ queryKey: authSessionQueryOptions().queryKey });
        }
        toast.error(authErrorMessage(res.error, t));
        return false;
      }
      toast.success(t("verifyEmail.sent", "We sent a new link to {{email}}.", { email }));
      return true;
    } finally {
      setPending(false);
    }
  }
  return { resend, pending };
}

/**
 * "Confirm your email" strip at the top of the app while the signed-in user's email isn't
 * verified, plus a dialog when the server answers EMAIL_NOT_VERIFIED. Mounted once, in `_app`.
 */
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const { session } = useAuthSession();
  const { resend, pending } = useResend();
  const user = session?.user;
  if (!user || user.emailVerified) return <VerifyEmailPromptHost email={user?.email ?? null} />;
  return (
    <>
      <div
        role="status"
        className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm sm:mb-4"
      >
        <MailWarning className="size-4 shrink-0 text-info" aria-hidden />
        <p className="min-w-0 flex-1 max-sm:basis-[calc(100%-1.75rem)]">
          {t(
            "verifyEmail.banner",
            "Confirm your email. We sent a link to {{email}}. You need it to buy labels or choose a plan.",
            { email: user.email },
          )}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="max-sm:ml-7"
          disabled={pending}
          onClick={() => void resend(user.email)}
        >
          {pending && <Loader2 className="animate-spin" />}
          {t("verifyEmail.resend", "Send a new link")}
        </Button>
      </div>
      <VerifyEmailPromptHost email={user.email} />
    </>
  );
}

function VerifyEmailPromptHost({ email }: { email: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { resend, pending } = useResend();

  useEffect(() => {
    const off = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      if (!isEmailNotVerified(event.action.error)) return;
      setOpen(true);
      // The session may be stale (verified in another tab is fine; unverified shows the banner).
      void queryClient.invalidateQueries({ queryKey: authSessionQueryOptions().queryKey });
    });
    return off;
  }, [queryClient]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("verifyEmail.title", "Confirm your email first")}</DialogTitle>
          <DialogDescription>
            {email
              ? t(
                  "verifyEmail.body",
                  "Buying labels and paying for a plan need a confirmed email. Open the link we sent to {{email}}, then try again.",
                  { email },
                )
              : t(
                  "verifyEmail.bodyNoEmail",
                  "Buying labels and paying for a plan need a confirmed email. Open the link we sent you, then try again.",
                )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("action.close", "Close")}
          </Button>
          {email && (
            <Button
              disabled={pending}
              onClick={async () => {
                if (await resend(email)) setOpen(false);
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              {t("verifyEmail.resend", "Send a new link")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

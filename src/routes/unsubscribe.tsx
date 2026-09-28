import { Button } from "@invai/ui";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleX, Loader2, MailX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { API_URL } from "../lib/env";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  component: UnsubscribePage,
});

type LinkResult =
  | { kind: "ok" }
  | { kind: "undone" }
  | { kind: "undo_refused" }
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "error" };

/** POSTs to the auth-less `/l/:token` route (README "Public link routes"), never oRPC. */
async function postLink(token: string, body?: { undo: true }): Promise<LinkResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/l/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { kind: "error" };
  }
  if (res.status === 429) return { kind: "rate_limited" };
  if (res.status === 400) return { kind: "invalid" };
  if (res.status === 409) return { kind: "undo_refused" };
  if (!res.ok) return { kind: "error" };
  const data = (await res.json().catch(() => null)) as { ok?: boolean; undone?: boolean } | null;
  if (data?.undone) return { kind: "undone" };
  if (data?.ok) return { kind: "ok" };
  return { kind: "error" };
}

function UnsubscribePage() {
  const { t } = useTranslation();
  const { token, error } = Route.useSearch();
  const [result, setResult] = useState<LinkResult | null>(null);

  const unsubscribe = useMutation({
    mutationFn: () => postLink(token ?? ""),
    onSuccess: setResult,
    onError: () => setResult({ kind: "error" }),
  });
  const undo = useMutation({
    mutationFn: () => postLink(token ?? "", { undo: true }),
    onSuccess: setResult,
    onError: () => setResult({ kind: "error" }),
  });

  const pending = unsubscribe.isPending || undo.isPending;

  if (!token || error === "invalid" || result?.kind === "invalid") {
    return (
      <AuthLayout title={t("digest.unsub.invalidTitle", "This link doesn't work anymore")}>
        <div role="alert" className="flex flex-col gap-4 text-sm">
          <CircleX className="size-8 text-danger" aria-hidden />
          <p>{t("digest.unsub.invalid", "This link doesn't work anymore.")}</p>
        </div>
      </AuthLayout>
    );
  }

  if (result?.kind === "ok") {
    return (
      <AuthLayout title={t("digest.unsub.doneTitle", "You're unsubscribed")}>
        <div role="status" className="flex flex-col gap-4 text-sm">
          <MailX className="size-8 text-muted-foreground" aria-hidden />
          <p>{t("digest.unsub.done", "You won't get the weekly review by email any more.")}</p>
          <Button
            variant="outline"
            className="w-fit"
            disabled={undo.isPending}
            onClick={() => undo.mutate()}
          >
            {undo.isPending && <Loader2 className="animate-spin" />}
            {t("digest.unsub.undo", "Undo")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (result?.kind === "undone") {
    return (
      <AuthLayout title={t("digest.unsub.undoneTitle", "You're back on the list")}>
        <div role="status" className="flex flex-col gap-4 text-sm">
          <CircleCheck className="size-8 text-success" aria-hidden />
          <p>
            {t("digest.unsub.undone", "You're back on the list. You'll get next Monday's review.")}
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("digest.unsub.title", "Manage your weekly review email")}>
      <div className="flex flex-col gap-4 text-sm">
        <p>{t("digest.unsub.confirmBody", "Stop getting the weekly business review by email?")}</p>
        {result?.kind === "undo_refused" && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-danger">
            {t(
              "digest.unsub.undoExpired",
              "This undo link has expired. Sign in and turn email back on from Settings.",
            )}
          </p>
        )}
        {result?.kind === "rate_limited" && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-danger">
            {t("digest.unsub.rateLimited", "Try again in a minute.")}
          </p>
        )}
        {result?.kind === "error" && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-danger">
            {t("digest.unsub.error", "Something went wrong. Try again.")}
          </p>
        )}
        <Button
          variant="destructive"
          className="w-fit"
          disabled={pending}
          onClick={() => unsubscribe.mutate()}
        >
          {unsubscribe.isPending && <Loader2 className="animate-spin" />}
          {t("digest.unsub.confirmButton", "Unsubscribe")}
        </Button>
      </div>
    </AuthLayout>
  );
}

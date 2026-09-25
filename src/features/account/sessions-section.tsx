import { Badge, Button, toast } from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Laptop, Loader2, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Section } from "../../components/page";
import { ErrorState, SkeletonRows } from "../../components/states";
import { authClient } from "../../lib/auth";
import { formatDateTime } from "../../lib/format";
import { authErrorMessage } from "./auth-errors";
import { describeDevice } from "./session";

export const sessionsQueryKey = ["auth", "sessions"] as const;

type AuthFailure = { code?: string; status?: number; message?: string };

class AuthRequestError extends Error {
  constructor(readonly info: AuthFailure) {
    super(info.message || info.code || "Request failed");
  }
}

async function listSessions() {
  const res = await authClient.listSessions();
  if (res.error) throw new AuthRequestError(res.error as AuthFailure);
  return res.data ?? [];
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

const ICONS = { phone: Smartphone, tablet: Tablet, computer: Laptop } as const;

/** Where the user is signed in, with sign-out per device. */
export function SessionsSection({ currentToken }: { currentToken: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sessions = useQuery({ queryKey: sessionsQueryKey, queryFn: listSessions, retry: false });
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [allPending, setAllPending] = useState(false);

  async function revoke(token: string) {
    setRevoking(token);
    try {
      const res = await authClient.revokeSession({ token });
      if (res.error) toast.error(authErrorMessage(res.error, t));
      else toast.success(t("account.deviceSignedOut", "That device is signed out."));
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } finally {
      setRevoking(null);
    }
  }

  async function revokeOthers() {
    setAllPending(true);
    try {
      const res = await authClient.revokeOtherSessions();
      if (res.error) toast.error(authErrorMessage(res.error, t));
      else toast.success(t("account.othersSignedOut", "Your other devices are signed out."));
      setConfirmAll(false);
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } finally {
      setAllPending(false);
    }
  }

  async function signInAgain() {
    await authClient.signOut().catch(() => undefined);
    queryClient.clear();
    await navigate({ to: "/login", search: { redirect: "/account" } });
  }

  const failure = sessions.error instanceof AuthRequestError ? sessions.error.info : null;
  const others = (sessions.data ?? []).filter((s) => s.token !== currentToken);

  let body: React.ReactNode;
  if (sessions.isPending) body = <SkeletonRows rows={3} />;
  else if (failure?.code === "SESSION_NOT_FRESH") {
    body = (
      <div role="status" className="flex flex-col items-start gap-3 text-sm">
        <p>
          {t(
            "account.sessionsStale",
            "For your safety, the device list needs a sign-in from the last 24 hours. Sign in again to see it.",
          )}
        </p>
        <Button size="sm" onClick={() => void signInAgain()}>
          {t("account.signInAgain", "Sign in again")}
        </Button>
      </div>
    );
  } else if (sessions.error) {
    body = failure ? (
      <p role="alert" className="text-sm text-danger">
        {authErrorMessage(failure, t)}
      </p>
    ) : (
      <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} compact />
    );
  } else {
    const rows = [...(sessions.data ?? [])].sort((a, b) =>
      a.token === currentToken
        ? -1
        : b.token === currentToken
          ? 1
          : (iso(b.updatedAt) ?? "").localeCompare(iso(a.updatedAt) ?? ""),
    );
    body = (
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((s) => {
          const d = describeDevice(s.userAgent);
          const Icon = ICONS[d.kind];
          const name =
            d.browser && d.os
              ? t("account.deviceName", "{{browser}} on {{os}}", { browser: d.browser, os: d.os })
              : (d.browser ?? d.os ?? t("account.unknownDevice", "Unknown device"));
          const current = s.token === currentToken;
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{name}</span>
                  {current && (
                    <Badge variant="success">{t("account.thisDevice", "This device")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    s.ipAddress,
                    t("account.lastActive", "Last active {{when}}", {
                      when: formatDateTime(iso(s.updatedAt)),
                    }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {!current && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revoking !== null}
                  onClick={() => void revoke(s.token)}
                  aria-label={t("account.signOutDeviceLabel", "Sign out {{device}}", {
                    device: name,
                  })}
                >
                  {revoking === s.token && <Loader2 className="animate-spin" />}
                  {t("account.signOutDevice", "Sign out")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Section
      title={t("account.sessions", "Where you're signed in")}
      description={t(
        "account.sessionsHint",
        "Don't recognize a device? Sign it out and change your password.",
      )}
      actions={
        others.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setConfirmAll(true)}>
            {t("account.signOutOthers", "Sign out other devices")}
          </Button>
        ) : undefined
      }
    >
      {body}
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t("account.signOutOthersTitle", "Sign out every other device?")}
        description={t(
          "account.signOutOthersBody",
          "You stay signed in here. Everyone else using your account has to sign in again.",
        )}
        confirmLabel={t("account.signOutOthers", "Sign out other devices")}
        destructive
        pending={allPending}
        onConfirm={() => void revokeOthers()}
      />
    </Section>
  );
}

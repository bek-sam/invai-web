import type { Role } from "@invai/contracts";
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../components/auth-layout";
import { Field } from "../components/page";
import { ErrorState } from "../components/states";
import { authClient } from "../lib/auth";
import { API_URL } from "../lib/env";

export const Route = createFileRoute("/accept-invite/$invitationId")({
  component: AcceptInvitePage,
});

type Preview =
  | {
      status: "pending";
      email: string;
      role: Role;
      organizationName: string;
      organizationType: "shop" | "vendor";
      invitedBy: string | null;
      hasAccount: boolean;
    }
  | { status: "expired" | "used" | "not_found" };

/** Company, role and invited email for the link, readable before anyone signs in. */
async function fetchPreview(id: string): Promise<Preview> {
  const res = await fetch(`${API_URL}/api/auth/invite-preview?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Invite check failed (${res.status})`);
  return (await res.json()) as Preview;
}

type AuthError = { code?: string; message?: string } | null | undefined;

function AcceptInvitePage() {
  const { t } = useTranslation();
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ["invite-preview", invitationId],
    queryFn: () => fetchPreview(invitationId),
    retry: 1,
  });
  const session = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => authClient.getSession(),
    staleTime: 0,
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Better Auth error codes → what happened and what to do, in the reader's language. */
  function explain(err: AuthError, fallback: string) {
    switch (err?.code) {
      case "INVITATION_NOT_FOUND":
        return t(
          "invite.gone",
          "This invite can't be used anymore. Ask the person who invited you to send a new one.",
        );
      case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
        return t(
          "invite.wrongEmail",
          "This invite is for a different email. Sign in with the email the invite was sent to.",
        );
      case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      case "USER_ALREADY_EXISTS":
        return t("invite.haveAccount", "You already have an account. Use Sign in instead.");
      case "INVALID_EMAIL_OR_PASSWORD":
        return t("auth.badCredentials", "Email or password is wrong");
      default:
        return err?.message || fallback;
    }
  }

  const invite = preview.data?.status === "pending" ? preview.data : null;
  const sessionEmail = session.data?.data?.user.email ?? null;
  const signedIn = !!sessionEmail;
  const sameEmail =
    !!invite && !!sessionEmail && sessionEmail.toLowerCase() === invite.email.toLowerCase();

  async function run(mode: "accept" | "signin" | "signup") {
    if (!invite) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "signin") {
        const r = await authClient.signIn.email({ email: invite.email, password });
        if (r.error) throw explain(r.error, t("auth.badCredentials", "Email or password is wrong"));
      } else if (mode === "signup") {
        const r = await authClient.signUp.email({ name, email: invite.email, password });
        if (r.error)
          throw explain(
            r.error,
            t("invite.signUpFailed", "We couldn't create your account. Try again."),
          );
      }
      const res = await authClient.organization.acceptInvitation({ invitationId });
      if (res.error)
        throw explain(
          res.error,
          t("invite.acceptFailed", "We couldn't accept the invite. Try again."),
        );
      const orgId = (res.data as { invitation?: { organizationId?: string } } | null)?.invitation
        ?.organizationId;
      if (orgId) await authClient.organization.setActive({ organizationId: orgId });
      queryClient.clear();
      await navigate({ to: invite.organizationType === "vendor" ? "/vendor" : "/" });
    } catch (e) {
      setError(
        typeof e === "string"
          ? e
          : t("invite.acceptFailed", "We couldn't accept the invite. Try again."),
      );
      await session.refetch();
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    await authClient.signOut().catch(() => undefined);
    queryClient.removeQueries({ queryKey: ["auth", "session"] });
    await session.refetch();
  }

  const errorBox = error && (
    <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );

  if (preview.isPending || session.isPending)
    return (
      <AuthLayout title={t("auth.inviteTitle", "Join your team")}>
        <Loader2 className="mx-auto animate-spin text-muted-foreground" />
      </AuthLayout>
    );

  if (preview.isError)
    return (
      <AuthLayout title={t("auth.inviteTitle", "Join your team")}>
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
      </AuthLayout>
    );

  if (!invite) {
    const status = preview.data?.status;
    return (
      <AuthLayout
        title={
          status === "used"
            ? t("invite.usedTitle", "This invite was already used")
            : status === "expired"
              ? t("invite.expiredTitle", "This invite has expired")
              : t("invite.invalidTitle", "This invite link doesn't work")
        }
        subtitle={
          status === "used"
            ? t("invite.usedHint", "If you accepted it, sign in to get to work.")
            : status === "expired"
              ? t(
                  "invite.expiredHint",
                  "Invites last a week. Ask the person who invited you to send a new one.",
                )
              : t(
                  "invite.invalidHint",
                  "It may have been canceled or copied wrong. Ask the person who invited you to send a new one.",
                )
        }
      >
        <Button asChild className="w-full">
          <Link to="/login">{t("auth.signIn", "Sign in")}</Link>
        </Button>
      </AuthLayout>
    );
  }

  const roleName = t(`roles.${invite.role}`, invite.role);
  const subtitle =
    invite.organizationType === "vendor"
      ? t("invite.vendorSubtitle", "{{company}} invited you to InvAI to receive DTF gang sheets.", {
          company: invite.invitedBy ?? invite.organizationName,
        })
      : t("invite.subtitle", "{{company}} invited you to join as {{role}}.", {
          company: invite.organizationName,
          role: roleName,
        });

  return (
    <AuthLayout title={t("auth.inviteTitle", "Join your team")} subtitle={subtitle}>
      {signedIn && sameEmail ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {t("auth.signedInAs", "Signed in as")} <strong>{sessionEmail}</strong>
          </p>
          {errorBox}
          <Button onClick={() => void run("accept")} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("auth.acceptInvite", "Accept invitation")}
          </Button>
        </div>
      ) : signedIn ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {t(
              "invite.otherAccount",
              "This invite is for {{invited}}, but you're signed in as {{current}}. Log out, then accept it with {{invited}}.",
              { invited: invite.email, current: sessionEmail },
            )}
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            {t("action.logOut")}
          </Button>
        </div>
      ) : (
        <Tabs defaultValue={invite.hasAccount ? "signin" : "signup"}>
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="signup">{t("auth.newAccount", "New account")}</TabsTrigger>
            <TabsTrigger value="signin">{t("auth.signIn", "Sign in")}</TabsTrigger>
          </TabsList>
          {(["signup", "signin"] as const).map((mode) => (
            <TabsContent key={mode} value={mode}>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(mode);
                }}
              >
                {mode === "signup" && (
                  <Field label={t("auth.yourName", "Your name")} htmlFor={`${mode}-name`}>
                    <Input
                      id={`${mode}-name`}
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                )}
                <Field
                  label={t("auth.email", "Email")}
                  htmlFor={`${mode}-email`}
                  hint={t("invite.emailFixed", "The invite is for this email.")}
                >
                  <Input id={`${mode}-email`} type="email" readOnly value={invite.email} />
                </Field>
                <Field label={t("auth.password", "Password")} htmlFor={`${mode}-password`}>
                  <Input
                    id={`${mode}-password`}
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {errorBox}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  {t("auth.acceptInvite", "Accept invitation")}
                </Button>
              </form>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </AuthLayout>
  );
}

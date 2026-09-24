import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@invai/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../components/auth-layout";
import { Field } from "../components/page";
import { authClient } from "../lib/auth";
import { errorMessage } from "../lib/errors";

export const Route = createFileRoute("/accept-invite/$invitationId")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { t } = useTranslation();
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => authClient.getSession(),
    staleTime: 0,
  });
  const signedIn = !!session.data?.data?.user;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    const res = await authClient.organization.acceptInvitation({ invitationId });
    if (res.error) throw new Error(res.error.message || "Invitation is no longer valid");
    const orgId = (res.data as { invitation?: { organizationId?: string } } | null)?.invitation
      ?.organizationId;
    if (orgId) await authClient.organization.setActive({ organizationId: orgId });
    queryClient.clear();
    await navigate({ to: "/" });
  }

  async function run(mode: "accept" | "signin" | "signup") {
    setPending(true);
    setError(null);
    try {
      if (mode === "signin") {
        const r = await authClient.signIn.email({ email, password });
        if (r.error) throw new Error(r.error.message || "Sign-in failed");
      } else if (mode === "signup") {
        const r = await authClient.signUp.email({ name, email, password });
        if (r.error) throw new Error(r.error.message || "Sign-up failed");
      }
      await accept();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const errorBox = error && (
    <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );

  return (
    <AuthLayout
      title={t("auth.inviteTitle", "Join your team")}
      subtitle={t("auth.inviteSubtitle", "You've been invited to a company on InvAI.")}
    >
      {session.isPending ? (
        <Loader2 className="mx-auto animate-spin text-muted-foreground" />
      ) : signedIn ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {t("auth.signedInAs", "Signed in as")} <strong>{session.data?.data?.user.email}</strong>
          </p>
          {errorBox}
          <Button onClick={() => void run("accept")} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("auth.acceptInvite", "Accept invitation")}
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="signup">
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
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                )}
                <Field label={t("auth.email", "Email")} htmlFor={`${mode}-email`}>
                  <Input
                    id={`${mode}-email`}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label={t("auth.password", "Password")} htmlFor={`${mode}-password`}>
                  <Input
                    id={`${mode}-password`}
                    type="password"
                    required
                    minLength={8}
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

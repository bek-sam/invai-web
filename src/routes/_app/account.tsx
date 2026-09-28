import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { DigestEmailToggleSection } from "../../components/digest/email-toggle-section";
import { Page } from "../../components/page";
import { ErrorState, SkeletonRows } from "../../components/states";
import { PasswordSection } from "../../features/account/password-section";
import { ProfileSection } from "../../features/account/profile-section";
import { useAuthSession } from "../../features/account/session";
import { SessionsSection } from "../../features/account/sessions-section";
import { TwoFactorSection } from "../../features/account/two-factor-section";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation();
  const auth = useAuthSession();
  return (
    <Page
      wide={false}
      title={t("account.title", "Your account")}
      description={t("account.subtitle", "Your name, language, password and sign-in safety.")}
    >
      {auth.isPending ? (
        <SkeletonRows rows={6} />
      ) : auth.error || auth.data?.error || !auth.session ? (
        <ErrorState error={auth.error ?? auth.data?.error} onRetry={() => void auth.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <ProfileSection user={auth.session.user} />
          <DigestEmailToggleSection />
          <PasswordSection email={auth.session.user.email} />
          <TwoFactorSection user={auth.session.user} />
          <SessionsSection currentToken={auth.session.session.token} />
        </div>
      )}
    </Page>
  );
}

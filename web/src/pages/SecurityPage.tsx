import { DevicesCard } from "../components/security/DevicesCard";
import { LoginHistoryCard } from "../components/security/LoginHistoryCard";
import { PasswordCard } from "../components/security/PasswordCard";
import { TwoFactorCard } from "../components/security/TwoFactorCard";
import { PageHeader } from "../components/PageHeader";
import { usePageTitle } from "../hooks/usePageTitle";
import pageStyles from "../components/page.module.scss";

const BACK_LINK = { to: "/settings", label: "Settings" };

/** Account security: signed-in devices, password, two-factor authentication, sign-in history. */
export function SecurityPage() {
  usePageTitle("Security");
  return (
    <div className={pageStyles.page}>
      <PageHeader
        backTo={BACK_LINK}
        title="Security"
        description="Where you're signed in, and how your account is protected."
      />
      <DevicesCard />
      <TwoFactorCard />
      <PasswordCard />
      <LoginHistoryCard />
    </div>
  );
}

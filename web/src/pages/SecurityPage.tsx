import { useTranslation } from "react-i18next";
import { DevicesCard } from "../components/security/DevicesCard";
import { LoginHistoryCard } from "../components/security/LoginHistoryCard";
import { PasswordCard } from "../components/security/PasswordCard";
import { TwoFactorCard } from "../components/security/TwoFactorCard";
import { PageHeader } from "../components/PageHeader";
import { usePageTitle } from "../hooks/usePageTitle";
import pageStyles from "../components/page.module.scss";

/** Account security: signed-in devices, password, two-factor authentication, sign-in history. */
export function SecurityPage() {
  const { t } = useTranslation();
  usePageTitle(t("security.page.title"));
  return (
    <div className={pageStyles.page}>
      <PageHeader
        backTo={{ to: "/settings", label: t("nav.items.settings") }}
        title={t("security.page.title")}
        description={t("security.page.description")}
      />
      <DevicesCard />
      <TwoFactorCard />
      <PasswordCard />
      <LoginHistoryCard />
    </div>
  );
}

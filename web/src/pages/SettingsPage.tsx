import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePageTitle } from "../hooks/usePageTitle";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { ButtonLink } from "../components/ButtonLink";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CurrencySelect } from "../components/CurrencySelect";
import { DetailList } from "../components/DetailList";
import { ErrorBanner } from "../components/ErrorBanner";
import { LanguageSelector } from "../components/LanguageSelector";
import { Notice } from "../components/Notice";
import { PageHeader } from "../components/PageHeader";
import { ThemeSelector } from "../components/ThemeSelector";
import type { CurrencyCode } from "../types/currency";
import { extractErrorMessage } from "../utils/errors";
import { formatDate } from "../utils/format";
import pageStyles from "../components/page.module.scss";
import styles from "./SettingsPage.module.scss";

export function SettingsPage() {
  const { t } = useTranslation();
  usePageTitle(t("settings.title"));
  const { user, logout, changeBaseCurrency } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const baseCurrency = user?.base_currency ?? "EUR";
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(baseCurrency);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isChangingCurrency, setIsChangingCurrency] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [currencyNotice, setCurrencyNotice] = useState<string | null>(null);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  }

  function handleCurrencySelect(currency: CurrencyCode) {
    setSelectedCurrency(currency);
    setCurrencyError(null);
    setCurrencyNotice(null);
  }

  async function handleConfirmCurrencyChange() {
    setIsChangingCurrency(true);
    try {
      await changeBaseCurrency(selectedCurrency);
      setCurrencyNotice(t("settings.currency.changed", { currency: selectedCurrency }));
    } catch (error) {
      setCurrencyError(extractErrorMessage(error));
    } finally {
      setIsChangingCurrency(false);
      setIsConfirmOpen(false);
    }
  }

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  return (
    <div className={pageStyles.page}>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <div className={styles.sections}>
        <Card padding="lg" className={styles.card}>
          <div className={styles.cardHeader}>
            <Avatar name={fullName || user?.email || "?"} size="lg" />
            <div>
              <h2 className={styles.title}>{t("settings.profile.title")}</h2>
              <p className={styles.hint}>{fullName || t("settings.profile.fallbackName")}</p>
            </div>
          </div>
          <DetailList
            items={[
              { label: t("settings.profile.email"), value: user?.email ?? t("common.states.notAvailable") },
              { label: t("settings.profile.firstName"), value: user?.first_name || t("common.states.notAvailable") },
              { label: t("settings.profile.lastName"), value: user?.last_name || t("common.states.notAvailable") },
              { label: t("settings.profile.memberSince"), value: user ? formatDate(user.date_joined) : t("common.states.notAvailable") },
            ]}
          />
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>{t("settings.appearance.title")}</h2>
            <p className={styles.hint}>{t("settings.appearance.hint")}</p>
          </div>
          <ThemeSelector fullWidth />
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>{t("settings.language.title")}</h2>
            <p className={styles.hint}>{t("settings.language.hint")}</p>
          </div>
          <LanguageSelector fullWidth />
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>{t("settings.currency.title")}</h2>
            <p className={styles.hint}>{t("settings.currency.hint")}</p>
          </div>
          <ErrorBanner message={currencyError} />
          {currencyNotice && <Notice tone="success">{currencyNotice}</Notice>}
          <CurrencySelect label={t("settings.currency.baseCurrency")} value={selectedCurrency} onChange={handleCurrencySelect} />
          <Button className={styles.action} onClick={() => setIsConfirmOpen(true)} disabled={selectedCurrency === baseCurrency}>
            {t("settings.currency.change")}
          </Button>
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>{t("settings.security.title")}</h2>
            <p className={styles.hint}>{t("settings.security.hint")}</p>
          </div>
          <ButtonLink to="/settings/security" variant="secondary" leadingIcon="security" className={styles.action}>
            {t("settings.security.manage")}
          </ButtonLink>
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>{t("settings.session.title")}</h2>
            <p className={styles.hint}>{t("settings.session.hint")}</p>
          </div>
          <Button variant="secondary" leadingIcon="log-out" className={styles.action} onClick={handleLogout} isLoading={isLoggingOut}>
            {t("common.actions.logOut")}
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={t("settings.currency.confirmTitle", { currency: selectedCurrency })}
        message={t("settings.currency.confirmMessage", { to: selectedCurrency, from: baseCurrency })}
        confirmLabel={t("settings.currency.confirmLabel")}
        isConfirming={isChangingCurrency}
        onConfirm={handleConfirmCurrencyChange}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}

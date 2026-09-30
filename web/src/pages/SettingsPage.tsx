import { useState } from "react";
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
import { Notice } from "../components/Notice";
import { PageHeader } from "../components/PageHeader";
import { ThemeSelector } from "../components/ThemeSelector";
import type { CurrencyCode } from "../types/currency";
import { extractErrorMessage } from "../utils/errors";
import pageStyles from "../components/page.module.scss";
import styles from "./SettingsPage.module.scss";

export function SettingsPage() {
  usePageTitle("Settings");
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
      setCurrencyNotice(`Your base currency is now ${selectedCurrency}. Totals, budgets and recurring amounts were converted.`);
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
      <PageHeader title="Settings" description="Your profile, how Spendly looks, and how your money is shown." />

      <div className={styles.sections}>
        <Card padding="lg" className={styles.card}>
          <div className={styles.cardHeader}>
            <Avatar name={fullName || user?.email || "?"} size="lg" />
            <div>
              <h2 className={styles.title}>Profile</h2>
              <p className={styles.hint}>{fullName || "Your account"}</p>
            </div>
          </div>
          <DetailList
            items={[
              { label: "Email", value: user?.email ?? "—" },
              { label: "First name", value: user?.first_name || "—" },
              { label: "Last name", value: user?.last_name || "—" },
              { label: "Member since", value: user ? new Date(user.date_joined).toLocaleDateString() : "—" },
            ]}
          />
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>Appearance</h2>
            <p className={styles.hint}>
              System follows your device&apos;s light or dark setting, including when it changes at sunset.
            </p>
          </div>
          <ThemeSelector fullWidth />
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>Currency</h2>
            <p className={styles.hint}>
              Totals, budgets and recurring amounts are shown in your base currency. Every transaction keeps the
              currency it was paid in.
            </p>
          </div>
          <ErrorBanner message={currencyError} />
          {currencyNotice && <Notice tone="success">{currencyNotice}</Notice>}
          <CurrencySelect label="Base currency" value={selectedCurrency} onChange={handleCurrencySelect} />
          <Button className={styles.action} onClick={() => setIsConfirmOpen(true)} disabled={selectedCurrency === baseCurrency}>
            Change base currency
          </Button>
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>Security</h2>
            <p className={styles.hint}>
              Signed-in devices, logging out everywhere, your password, two-factor authentication and recent
              sign-ins.
            </p>
          </div>
          <ButtonLink to="/settings/security" variant="secondary" leadingIcon="security" className={styles.action}>
            Manage security
          </ButtonLink>
        </Card>

        <Card padding="lg" className={styles.card}>
          <div>
            <h2 className={styles.title}>Session</h2>
            <p className={styles.hint}>Log out of Spendly on this device.</p>
          </div>
          <Button variant="secondary" leadingIcon="log-out" className={styles.action} onClick={handleLogout} isLoading={isLoggingOut}>
            Log out
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={`Switch to ${selectedCurrency}?`}
        message={
          `Totals will be shown in ${selectedCurrency} instead of ${baseCurrency}. Each transaction is converted ` +
          "with the ECB rate of its own date; budgets and recurring amounts are converted at the latest rate. " +
          "The original amounts of your transactions don't change."
        }
        confirmLabel="Switch currency"
        isConfirming={isChangingCurrency}
        onConfirm={handleConfirmCurrencyChange}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}

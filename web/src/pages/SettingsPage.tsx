import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CurrencySelect } from "../components/CurrencySelect";
import { ErrorBanner } from "../components/ErrorBanner";
import type { CurrencyCode } from "../types/currency";
import { extractErrorMessage } from "../utils/errors";
import styles from "./SettingsPage.module.scss";

export function SettingsPage() {
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

  return (
    <section>
      <h1>Settings</h1>

      <div className={styles.card}>
        <h2>Profile</h2>
        <dl className={styles.profile}>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
          <dt>First name</dt>
          <dd>{user?.first_name || "—"}</dd>
          <dt>Last name</dt>
          <dd>{user?.last_name || "—"}</dd>
          <dt>Member since</dt>
          <dd>{user ? new Date(user.date_joined).toLocaleDateString() : "—"}</dd>
        </dl>
      </div>

      <div className={styles.card}>
        <h2>Currency</h2>
        <p className={styles.hint}>
          Totals, budgets and recurring amounts are shown in your base currency. Every transaction keeps the
          currency it was paid in.
        </p>
        <ErrorBanner message={currencyError} />
        {currencyNotice && (
          <p className={styles.notice} role="status">
            {currencyNotice}
          </p>
        )}
        <CurrencySelect label="Base currency" value={selectedCurrency} onChange={handleCurrencySelect} />
        <Button onClick={() => setIsConfirmOpen(true)} disabled={selectedCurrency === baseCurrency}>
          Change base currency
        </Button>
      </div>

      <div className={styles.card}>
        <h2>Session</h2>
        <p>Log out of Spendly on this device.</p>
        <Button variant="danger" onClick={handleLogout} isLoading={isLoggingOut}>
          Log out
        </Button>
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
    </section>
  );
}

import { useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { SavingsGoal } from "../../types/savingsGoal";
import { depositToSavingsGoal, withdrawFromSavingsGoal } from "../../services/savingsGoalsService";
import { extractErrorMessage, extractFieldErrors } from "../../utils/errors";
import { amountStep, hasValidPrecision } from "../../utils/currency";
import { formatCurrency } from "../../utils/format";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { ErrorBanner } from "../ErrorBanner";
import formStyles from "../form.module.scss";

export type MoneyDirection = "deposit" | "withdraw";

interface MoneyModalProps {
  /** null = closed. */
  goal: SavingsGoal | null;
  direction: MoneyDirection;
  onClose: () => void;
  onSaved: (goal: SavingsGoal) => void;
}

/**
 * Sends only the amount to add or remove: the server updates the balance atomically and
 * answers with the new figures, so the client never adds money up itself.
 */
export function MoneyModal({ goal, direction, onClose, onSaved }: MoneyModalProps) {
  if (!goal) return null;
  // A new key per goal and direction starts the form empty — no state reset needed.
  return (
    <MoneyForm key={`${goal.id}-${direction}`} goal={goal} direction={direction} onClose={onClose} onSaved={onSaved} />
  );
}

interface MoneyFormProps extends MoneyModalProps {
  goal: SavingsGoal;
}

function MoneyForm({ goal, direction, onClose, onSaved }: MoneyFormProps) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | undefined>();
  const isDeposit = direction === "deposit";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    const numeric = Number(amount);
    if (!amount.trim() || !Number.isFinite(numeric) || numeric <= 0) {
      setAmountError(t("goals.money.enterAmount"));
      return;
    }
    if (!hasValidPrecision(amount, goal.currency)) {
      setAmountError(t("common.validation.noDecimals", { currency: goal.currency }));
      return;
    }
    setAmountError(undefined);

    setIsSubmitting(true);
    try {
      const saved = isDeposit
        ? await depositToSavingsGoal(goal.id, amount)
        : await withdrawFromSavingsGoal(goal.id, amount);
      setIsSubmitting(false);
      onSaved(saved);
    } catch (error) {
      setIsSubmitting(false);
      setAmountError(extractFieldErrors(error).amount);
      setErrorMessage(extractErrorMessage(error));
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isDeposit ? t("goals.card.addMoneyTo", { name: goal.name }) : t("goals.card.removeMoneyFrom", { name: goal.name })}
    >
      <form onSubmit={handleSubmit} className={formStyles.stack} noValidate>
        <ErrorBanner message={errorMessage} />
        <p className={formStyles.note}>
          <Trans
            i18nKey="goals.money.saved"
            values={{
              saved: formatCurrency(goal.current_amount, goal.currency),
              target: formatCurrency(goal.target_amount, goal.currency),
            }}
            components={{ strong: <strong /> }}
          />
        </p>
        <TextField
          label={t("goals.money.amount", { currency: goal.currency })}
          type="number"
          inputMode="decimal"
          step={amountStep(goal.currency)}
          min={amountStep(goal.currency)}
          placeholder={amountStep(goal.currency) === "1" ? "0" : "0.00"}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={amountError}
          autoFocus
        />
        <div className={formStyles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="submit" variant={isDeposit ? "primary" : "danger"} isLoading={isSubmitting}>
            {isDeposit ? t("goals.money.submitAdd") : t("goals.money.submitRemove")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, type FormEvent } from "react";
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
      setAmountError("Enter an amount greater than 0.");
      return;
    }
    if (!hasValidPrecision(amount, goal.currency)) {
      setAmountError(`${goal.currency} amounts can't have decimals.`);
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
      title={isDeposit ? `Add money to ${goal.name}` : `Remove money from ${goal.name}`}
    >
      <form onSubmit={handleSubmit} className={formStyles.stack} noValidate>
        <ErrorBanner message={errorMessage} />
        <p className={formStyles.note}>
          Saved so far: <strong>{formatCurrency(goal.current_amount, goal.currency)}</strong> of{" "}
          {formatCurrency(goal.target_amount, goal.currency)}
        </p>
        <TextField
          label={`Amount (${goal.currency})`}
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
            Cancel
          </Button>
          <Button type="submit" variant={isDeposit ? "primary" : "danger"} isLoading={isSubmitting}>
            {isDeposit ? "Add money" : "Remove money"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

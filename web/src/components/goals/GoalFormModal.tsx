import { useEffect, useState, type FormEvent } from "react";
import type { CurrencyCode } from "../../types/currency";
import type { SavingsGoal } from "../../types/savingsGoal";
import { createSavingsGoal, updateSavingsGoal } from "../../services/savingsGoalsService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { amountStep, hasValidPrecision } from "../../utils/currency";
import { toIsoDate } from "../../utils/date";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { ErrorBanner } from "../ErrorBanner";
import { CurrencySelect } from "../CurrencySelect";
import styles from "./GoalForms.module.scss";

interface GoalFormModalProps {
  isOpen: boolean;
  /** null = create a new goal. */
  goal: SavingsGoal | null;
  onClose: () => void;
  onSaved: (goal: SavingsGoal) => void;
}

function validateAmount(value: string, currency: CurrencyCode, { required }: { required: boolean }): string | undefined {
  if (!value.trim()) return required ? "Amount is required." : undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "Enter a valid amount.";
  if (!hasValidPrecision(value, currency)) return `${currency} amounts can't have decimals.`;
  return undefined;
}

export function GoalFormModal({ isOpen, goal, onClose, onSaved }: GoalFormModalProps) {
  const baseCurrency = useBaseCurrency();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [targetDate, setTargetDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!isOpen) return;
    setName(goal?.name ?? "");
    setTargetAmount(goal?.target_amount ?? "");
    setCurrentAmount(goal?.current_amount ?? "");
    setCurrency(goal?.currency ?? baseCurrency);
    setTargetDate(goal?.target_date ?? "");
    setErrorMessage(null);
    setFieldErrors({});
  }, [isOpen, goal, baseCurrency]);

  // The server refuses a currency change once money is saved (the amounts would mean something else).
  const currencyLocked = goal !== null && Number(goal.current_amount) > 0;
  const today = toIsoDate(new Date());

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Name is required.";
    const targetError = validateAmount(targetAmount, currency, { required: true });
    if (targetError) errors.target_amount = targetError;
    else if (Number(targetAmount) <= 0) errors.target_amount = "The target must be greater than 0.";
    const currentError = validateAmount(currentAmount, currency, { required: false });
    if (currentError) errors.current_amount = currentError;
    // An unchanged past date is fine (the goal is overdue); a newly chosen one must be ahead.
    if (targetDate && targetDate < today && targetDate !== goal?.target_date) {
      errors.target_date = "The target date can't be in the past.";
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        target_amount: targetAmount,
        currency,
        target_date: targetDate || null,
        ...(currentAmount.trim() ? { current_amount: currentAmount } : {}),
      };
      const saved = goal ? await updateSavingsGoal(goal.id, payload) : await createSavingsGoal(payload);
      setIsSubmitting(false);
      onSaved(saved);
    } catch (error) {
      setIsSubmitting(false);
      setFieldErrors((previous) => ({ ...previous, ...extractFieldErrors(error) }));
      setErrorMessage(extractErrorMessage(error));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={goal ? "Edit goal" : "New savings goal"}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <ErrorBanner message={errorMessage} />

        <TextField
          label="Name"
          placeholder="e.g. Japan trip, Emergency fund"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
          maxLength={100}
        />

        <div className={styles.amountRow}>
          <TextField
            label="Target amount"
            type="number"
            step={amountStep(currency)}
            min={amountStep(currency)}
            placeholder={amountStep(currency) === "1" ? "0" : "0.00"}
            value={targetAmount}
            onChange={(event) => setTargetAmount(event.target.value)}
            error={fieldErrors.target_amount}
          />
          <CurrencySelect
            value={currency}
            onChange={setCurrency}
            disabled={currencyLocked}
            error={fieldErrors.currency}
          />
        </div>
        {currencyLocked && (
          <p className={styles.hint}>The currency can't change once money is saved in the goal.</p>
        )}

        <TextField
          label={goal ? "Saved so far" : "Already saved (optional)"}
          type="number"
          step={amountStep(currency)}
          min="0"
          placeholder={amountStep(currency) === "1" ? "0" : "0.00"}
          value={currentAmount}
          onChange={(event) => setCurrentAmount(event.target.value)}
          error={fieldErrors.current_amount}
        />

        <TextField
          label="Target date (optional)"
          type="date"
          min={today}
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          error={fieldErrors.target_date}
        />

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {goal ? "Save changes" : "Create goal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

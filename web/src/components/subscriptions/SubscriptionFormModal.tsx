import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Category } from "../../types/category";
import type { CurrencyCode } from "../../types/currency";
import type { RecurringFrequency } from "../../types/recurringTransaction";
import type { Subscription } from "../../types/subscription";
import { createSubscription, updateSubscription } from "../../services/subscriptionsService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { toIsoDate } from "../../utils/date";
import { amountStep, hasValidPrecision } from "../../utils/currency";
import { FREQUENCY_LABELS } from "../../utils/subscriptions";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { Select } from "../Select";
import { ErrorBanner } from "../ErrorBanner";
import { CurrencySelect } from "../CurrencySelect";
import styles from "./SubscriptionFormModal.module.scss";

const FREQUENCY_OPTIONS = (Object.keys(FREQUENCY_LABELS) as RecurringFrequency[]).map((value) => ({
  value,
  label: FREQUENCY_LABELS[value],
}));

interface SubscriptionFormModalProps {
  isOpen: boolean;
  /** null = add a new subscription. */
  subscription: Subscription | null;
  categories: Category[];
  onClose: () => void;
  onSaved: (saved: Subscription) => void;
}

export function SubscriptionFormModal({
  isOpen,
  subscription,
  categories,
  onClose,
  onSaved,
}: SubscriptionFormModalProps) {
  const baseCurrency = useBaseCurrency();
  const [name, setName] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [startDate, setStartDate] = useState(() => toIsoDate(new Date()));
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!isOpen) return;
    setName(subscription?.name ?? "");
    setMerchant(subscription?.merchant ?? "");
    setAmount(subscription?.amount ?? "");
    setCurrency(subscription?.currency ?? baseCurrency);
    setCategoryId(subscription ? String(subscription.category) : "");
    setFrequency(subscription?.frequency ?? "monthly");
    setStartDate(subscription?.start_date ?? toIsoDate(new Date()));
    setEndDate(subscription?.end_date ?? "");
    setDescription(subscription?.description ?? "");
    setActive(subscription?.active ?? true);
    setErrorMessage(null);
    setFieldErrors({});
  }, [isOpen, subscription, baseCurrency]);

  // Subscriptions are expenses: the backend rejects an income category.
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.type === "expense")
        .map((category) => ({ value: String(category.id), label: category.name })),
    [categories]
  );

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Name is required.";

    const numericAmount = Number(amount);
    if (!amount.trim()) {
      errors.amount = "Amount is required.";
    } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = "Amount must be greater than 0.";
    } else if (!hasValidPrecision(amount, currency)) {
      errors.amount = `${currency} amounts can't have decimals.`;
    }

    if (!categoryId) errors.category = "Choose a category.";
    if (!startDate) errors.start_date = "Start date is required.";
    if (endDate && startDate && endDate < startDate) {
      errors.end_date = "End date must be on or after the start date.";
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
        merchant: merchant.trim(),
        amount,
        currency,
        category: Number(categoryId),
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        description: description.trim(),
        active,
      };
      const saved = subscription
        ? await updateSubscription(subscription.id, payload)
        : await createSubscription(payload);
      setIsSubmitting(false);
      onSaved(saved);
    } catch (error) {
      setIsSubmitting(false);
      setFieldErrors((previous) => ({ ...previous, ...extractFieldErrors(error) }));
      setErrorMessage(extractErrorMessage(error));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={subscription ? "Edit subscription" : "Add subscription"}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <ErrorBanner message={errorMessage} />

        <TextField
          label="Name"
          placeholder="e.g. Netflix, Spotify, Gym"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />

        <TextField
          label="Merchant (optional)"
          placeholder="e.g. Netflix International B.V."
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          error={fieldErrors.merchant}
        />

        <div className={styles.amountRow}>
          <TextField
            label="Price per payment"
            type="number"
            step={amountStep(currency)}
            min={amountStep(currency)}
            placeholder={amountStep(currency) === "1" ? "0" : "0.00"}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={fieldErrors.amount}
          />
          <CurrencySelect value={currency} onChange={setCurrency} error={fieldErrors.currency} />
        </div>

        <div className={styles.twoColumns}>
          <Select
            label="Billing"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
            options={FREQUENCY_OPTIONS}
            error={fieldErrors.frequency}
          />
          <Select
            label="Category"
            placeholder="Select a category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={categoryOptions}
            error={fieldErrors.category}
          />
        </div>

        <div className={styles.twoColumns}>
          <TextField
            label="First payment"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            error={fieldErrors.start_date}
          />
          <TextField
            label="Last payment (optional)"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            error={fieldErrors.end_date}
          />
        </div>

        <TextField
          label="Notes (optional)"
          placeholder="e.g. Family plan, shared with Anna"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={fieldErrors.description}
        />

        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Active (paused subscriptions are left out of the totals)
        </label>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {subscription ? "Save changes" : "Add subscription"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

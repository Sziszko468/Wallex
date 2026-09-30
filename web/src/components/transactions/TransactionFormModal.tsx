import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Category, TransactionType } from "../../types/category";
import type { ConversionPreview, CurrencyCode } from "../../types/currency";
import type { Transaction } from "../../types/transaction";
import { createTransaction, updateTransaction } from "../../services/transactionsService";
import { convertAmount } from "../../services/currenciesService";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  conflictCurrent,
  extractErrorMessage,
  extractFieldErrors,
  isNotFound,
  type FieldErrors,
} from "../../utils/errors";
import { amountStep, hasValidPrecision } from "../../utils/currency";
import { formatCurrency, formatDate } from "../../utils/format";
import { toIsoDate } from "../../utils/date";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { Select } from "../Select";
import { CurrencySelect } from "../CurrencySelect";
import { ErrorBanner } from "../ErrorBanner";
import { TypeToggle } from "../TypeToggle";
import formStyles from "../form.module.scss";
import styles from "./TransactionFormModal.module.scss";

interface TransactionFormModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  categories: Category[];
  /** Overrides the default "Add transaction" / "Edit transaction" title. */
  title?: string;
  onClose: () => void;
  onSaved: () => void;
}

const PREVIEW_DELAY_MS = 400;

type PreviewResult = { data: ConversionPreview } | { error: string };

function isPositiveAmount(amount: string): boolean {
  const numeric = Number(amount);
  return amount.trim() !== "" && Number.isFinite(numeric) && numeric > 0;
}

export function TransactionFormModal({
  isOpen,
  transaction,
  categories,
  title,
  onClose,
  onSaved,
}: TransactionFormModalProps) {
  const baseCurrency = useBaseCurrency();
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // The server version the form was filled from (its updated_at): sent as If-Match, so an
  // edit made meanwhile on another device is never silently overwritten.
  const [version, setVersion] = useState<string | undefined>(undefined);

  function fillFrom(source: Transaction) {
    setType(source.type);
    setAmount(source.amount);
    setCurrency(source.currency);
    setCategoryId(String(source.category));
    setDescription(source.description);
    setDate(source.date);
    setVersion(source.updated_at);
  }

  // Re-seed the form whenever the modal opens — either from the transaction
  // being edited, or a blank slate for a new one. Not a live sync while open.
  useEffect(() => {
    if (!isOpen) return;
    if (transaction) {
      fillFrom(transaction);
    } else {
      setType("expense");
      setAmount("");
      setCurrency(baseCurrency);
      setCategoryId("");
      setDescription("");
      setDate(toIsoDate(new Date()));
      setVersion(undefined);
    }
    setErrorMessage(null);
    setFieldErrors({});
  }, [isOpen, transaction, baseCurrency]);

  // Live "≈ €41.06" preview for another currency. The backend converts (the same
  // way it will when saving); the form only shows the result.
  const debouncedAmount = useDebouncedValue(amount, PREVIEW_DELAY_MS);
  const previewKey =
    isOpen &&
    currency !== baseCurrency &&
    date &&
    isPositiveAmount(debouncedAmount) &&
    hasValidPrecision(debouncedAmount, currency)
      ? `${debouncedAmount}|${currency}|${date}`
      : null;
  const [preview, setPreview] = useState<{ key: string; result: PreviewResult } | null>(null);

  useEffect(() => {
    if (previewKey === null) return;
    let isCurrent = true;
    convertAmount({ amount: debouncedAmount, currency, date })
      .then((data) => {
        if (isCurrent) setPreview({ key: previewKey, result: { data } });
      })
      .catch((error: unknown) => {
        if (isCurrent) setPreview({ key: previewKey, result: { error: extractErrorMessage(error) } });
      });
    return () => {
      isCurrent = false;
    };
  }, [previewKey, debouncedAmount, currency, date]);

  const previewResult = preview !== null && preview.key === previewKey ? preview.result : null;

  const availableCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type]
  );

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    // The previously selected category almost certainly doesn't match the
    // new type (the backend rejects that combination), so force a re-pick.
    setCategoryId("");
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};

    if (!amount.trim()) {
      errors.amount = "Amount is required.";
    } else if (!isPositiveAmount(amount)) {
      errors.amount = "Amount must be greater than 0.";
    } else if (!hasValidPrecision(amount, currency)) {
      errors.amount = `${currency} amounts can't have decimals.`;
    }

    if (!categoryId) {
      errors.category = "Choose a category.";
    }

    if (!date) {
      errors.date = "Date is required.";
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
        amount,
        currency,
        type,
        category: Number(categoryId),
        description: description.trim() || undefined,
        date,
      };
      if (transaction) {
        await updateTransaction(transaction.id, payload, version);
      } else {
        await createTransaction(payload);
      }
      setIsSubmitting(false);
      onSaved();
    } catch (error) {
      setIsSubmitting(false);
      const latest = conflictCurrent<Transaction>(error);
      if (latest) {
        // Changed on another device since the form was opened: show what is there now.
        fillFrom(latest);
        setFieldErrors({});
        setErrorMessage(
          "This transaction was just changed on another device. Its latest version is shown — make your change again and save."
        );
        return;
      }
      if (transaction && isNotFound(error)) {
        setErrorMessage("This transaction no longer exists — it was deleted on another device.");
        return;
      }
      setFieldErrors((previous) => ({ ...previous, ...extractFieldErrors(error) }));
      setErrorMessage(extractErrorMessage(error));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? (transaction ? "Edit transaction" : "Add transaction")}>
      <form onSubmit={handleSubmit} className={formStyles.stack} noValidate>
        <ErrorBanner message={errorMessage} />

        <TypeToggle value={type} onChange={handleTypeChange} />

        <div className={styles.amountBlock}>
          <div className={formStyles.amountRow}>
            <TextField
              label="Amount"
              variant="amount"
              type="number"
              inputMode="decimal"
              step={amountStep(currency)}
              min={amountStep(currency)}
              placeholder={amountStep(currency) === "1" ? "0" : "0.00"}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              error={fieldErrors.amount}
              autoFocus={!transaction}
            />
            <CurrencySelect
              value={currency}
              onChange={setCurrency}
              error={fieldErrors.currency ?? fieldErrors.exchange_rate}
            />
          </div>

          {previewKey !== null && (
            <p className={styles.conversion} aria-live="polite">
              {previewResult === null && "Converting…"}
              {previewResult !== null && "data" in previewResult && (
                <>
                  ≈ {formatCurrency(previewResult.data.base_amount, previewResult.data.base_currency)}
                  {previewResult.data.rate_date && (
                    <span className={styles.rateSource}> · ECB rate of {formatDate(previewResult.data.rate_date)}</span>
                  )}
                </>
              )}
              {previewResult !== null && "error" in previewResult && (
                <span className={styles.conversionError}>{previewResult.error}</span>
              )}
            </p>
          )}
        </div>

        <Select
          label="Category"
          placeholder="Select a category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={availableCategories.map((category) => ({
            value: String(category.id),
            label: category.name,
          }))}
          error={fieldErrors.category}
        />

        <TextField
          label="Description (optional)"
          placeholder="e.g. Groceries"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          error={fieldErrors.date}
        />

        <div className={formStyles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {transaction ? "Save changes" : "Add transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

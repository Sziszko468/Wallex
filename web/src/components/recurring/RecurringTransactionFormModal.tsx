import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Category, TransactionType } from "../../types/category";
import type { CurrencyCode } from "../../types/currency";
import type {
  RecurringFrequency,
  RecurringTransaction,
} from "../../types/recurringTransaction";
import {
  createRecurringTransaction,
  updateRecurringTransaction,
} from "../../services/recurringTransactionsService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { toIsoDate } from "../../utils/date";
import { amountStep, hasValidPrecision } from "../../utils/currency";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { Select } from "../Select";
import { ErrorBanner } from "../ErrorBanner";
import { TypeToggle } from "../TypeToggle";
import { Checkbox } from "../Checkbox";
import formStyles from "../form.module.scss";
import { CurrencySelect } from "../CurrencySelect";

const FREQUENCIES: readonly RecurringFrequency[] = ["weekly", "monthly", "yearly"];

interface RecurringTransactionFormModalProps {
  isOpen: boolean;
  item: RecurringTransaction | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export function RecurringTransactionFormModal({
  isOpen,
  item,
  categories,
  onClose,
  onSaved,
}: RecurringTransactionFormModalProps) {
  const { t } = useTranslation();
  // An amount is billed in its own currency (default: the base currency) and never converted.
  const baseCurrency = useBaseCurrency();
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(baseCurrency);
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [startDate, setStartDate] = useState(() => toIsoDate(new Date()));
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!isOpen) return;
    if (item) {
      setName(item.name);
      setType(item.type);
      setCategoryId(String(item.category));
      setAmount(item.amount);
      setCurrency(item.currency);
      setFrequency(item.frequency);
      setStartDate(item.start_date);
      setEndDate(item.end_date ?? "");
      setDescription(item.description);
      setIsActive(item.is_active);
    } else {
      setName("");
      setType("expense");
      setCategoryId("");
      setAmount("");
      setCurrency(baseCurrency);
      setFrequency("monthly");
      setStartDate(toIsoDate(new Date()));
      setEndDate("");
      setDescription("");
      setIsActive(true);
    }
    setErrorMessage(null);
    setFieldErrors({});
  }, [isOpen, item, baseCurrency]);

  const availableCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type]
  );

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setCategoryId("");
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = t("common.validation.nameRequired");

    const numericAmount = Number(amount);
    if (!amount.trim()) {
      errors.amount = t("common.validation.amountRequired");
    } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = t("common.validation.amountPositive");
    } else if (!hasValidPrecision(amount, currency)) {
      errors.amount = t("common.validation.noDecimals", { currency });
    }

    if (!categoryId) errors.category = t("common.validation.categoryRequired");
    if (!startDate) errors.start_date = t("recurring.form.errors.startRequired");
    if (endDate && startDate && endDate < startDate) {
      errors.end_date = t("recurring.form.errors.endBeforeStart");
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
        category: Number(categoryId),
        type,
        amount,
        currency,
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        description: description.trim() || undefined,
        is_active: isActive,
      };
      if (item) {
        await updateRecurringTransaction(item.id, payload);
      } else {
        await createRecurringTransaction(payload);
      }
      setIsSubmitting(false);
      onSaved();
    } catch (error) {
      setIsSubmitting(false);
      setFieldErrors((previous) => ({ ...previous, ...extractFieldErrors(error) }));
      setErrorMessage(extractErrorMessage(error));
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item ? t("recurring.form.editTitle") : t("recurring.form.addTitle")}
    >
      <form onSubmit={handleSubmit} className={formStyles.stack} noValidate>
        <ErrorBanner message={errorMessage} />

        <TypeToggle value={type} onChange={handleTypeChange} />

        <TextField
          label={t("common.form.name")}
          placeholder={t("recurring.form.namePlaceholder")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />

        <div className={formStyles.amountRow}>
          <TextField
            label={t("common.form.amount")}
            type="number"
            inputMode="decimal"
            step={amountStep(currency)}
            min={amountStep(currency)}
            placeholder={amountStep(currency) === "1" ? "0" : "0.00"}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={fieldErrors.amount}
          />
          <CurrencySelect value={currency} onChange={setCurrency} error={fieldErrors.currency} />
        </div>

        <div className={formStyles.row}>
          <Select
            label={t("common.form.category")}
            placeholder={t("common.form.selectCategory")}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={availableCategories.map((category) => ({
              value: String(category.id),
              label: category.name,
            }))}
            error={fieldErrors.category}
          />

          <Select
            label={t("recurring.form.frequency")}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
            options={FREQUENCIES.map((value) => ({ value, label: t(`recurring.frequency.${value}`) }))}
          />
        </div>

        <div className={formStyles.row}>
          <TextField
            label={t("recurring.form.startDate")}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            error={fieldErrors.start_date}
          />
          <TextField
            label={t("recurring.form.endDate")}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            error={fieldErrors.end_date}
          />
        </div>

        <TextField
          label={t("common.form.descriptionOptional")}
          placeholder={t("recurring.form.descriptionPlaceholder")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <Checkbox
          label={t("recurring.form.active")}
          hint={t("recurring.form.activeHint")}
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />

        <div className={formStyles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {item ? t("recurring.form.submitSave") : t("recurring.form.submitAdd")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

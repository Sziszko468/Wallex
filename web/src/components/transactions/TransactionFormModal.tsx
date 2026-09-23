import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Category, TransactionType } from "../../types/category";
import type { Transaction } from "../../types/transaction";
import { createTransaction, updateTransaction } from "../../services/transactionsService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { toIsoDate } from "../../utils/date";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { Select } from "../Select";
import { ErrorBanner } from "../ErrorBanner";
import { TypeToggle } from "../TypeToggle";
import styles from "./TransactionFormModal.module.scss";

interface TransactionFormModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export function TransactionFormModal({
  isOpen,
  transaction,
  categories,
  onClose,
  onSaved,
}: TransactionFormModalProps) {
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Re-seed the form whenever the modal opens — either from the transaction
  // being edited, or a blank slate for a new one. Not a live sync while open.
  useEffect(() => {
    if (!isOpen) return;
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount);
      setCategoryId(String(transaction.category));
      setDescription(transaction.description);
      setDate(transaction.date);
    } else {
      setType("expense");
      setAmount("");
      setCategoryId("");
      setDescription("");
      setDate(toIsoDate(new Date()));
    }
    setErrorMessage(null);
    setFieldErrors({});
  }, [isOpen, transaction]);

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
    const numericAmount = Number(amount);

    if (!amount.trim()) {
      errors.amount = "Amount is required.";
    } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = "Amount must be greater than 0.";
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
        type,
        category: Number(categoryId),
        description: description.trim() || undefined,
        date,
      };
      if (transaction) {
        await updateTransaction(transaction.id, payload);
      } else {
        await createTransaction(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={transaction ? "Edit transaction" : "Add transaction"}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <ErrorBanner message={errorMessage} />

        <TypeToggle value={type} onChange={handleTypeChange} />

        <TextField
          label="Amount"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={fieldErrors.amount}
        />

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

        <div className={styles.actions}>
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { useCreateTransaction } from "../hooks/useCreateTransaction";
import { listCategories } from "../services/categoriesService";
import { getTransaction, updateTransaction } from "../services/transactionsService";
import {
  conflictCurrent,
  extractErrorMessage,
  extractFieldErrors,
  isNotFound,
  type FieldErrors,
} from "../utils/errors";
import { toIsoDate, isValidIsoDate } from "../utils/date";
import { hasValidPrecision } from "../utils/currency";
import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import { SectionState } from "../components/SectionState";
import { TypeToggle } from "../components/TypeToggle";
import { CategoryChipPicker } from "../components/CategoryChipPicker";
import { QuickDateField } from "../components/QuickDateField";
import type { TransactionType } from "../types/category";
import type { Transaction } from "../types/transaction";
import { colors, fontSize, spacing } from "../utils/theme";

/** Small fixed delay so the "Saved ✓" state is actually visible before the
 * modal auto-dismisses — long enough to register, short enough to stay fast. */
const SUCCESS_DISMISS_DELAY_MS = 550;

/**
 * Handles both creating a new transaction (no `id` route param) and editing
 * an existing one (`/edit-transaction/[id]`) — same fields, same validation,
 * same reusable pieces (TypeToggle/CategoryChipPicker/QuickDateField), just
 * a different initial fetch and a PATCH instead of a POST on submit.
 */
export function TransactionFormScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const transactionId = id ? Number(id) : null;
  const isEditMode = transactionId !== null;
  const { create, isOffline } = useCreateTransaction();

  // Not live: the form keeps the version the user started editing (sent as If-Match),
  // instead of being re-seeded when another device changes the transaction.
  const existingTransaction = useAsyncData(
    useCallback(() => {
      if (transactionId === null) return Promise.resolve(null);
      return getTransaction(transactionId);
    }, [transactionId]),
    { live: false }
  );
  const categories = useAsyncData(useCallback(() => listCategories(), []));
  // New transactions are recorded in the base currency (the API's default); an edited one keeps its own.
  const baseCurrency = useBaseCurrency();
  const currency = existingTransaction.data?.currency ?? baseCurrency;

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // The server version the form was filled from (its updated_at), sent as If-Match.
  const [version, setVersion] = useState<string | undefined>(undefined);

  function fillFrom(transaction: Transaction) {
    setType(transaction.type);
    setAmount(transaction.amount);
    setCategoryId(transaction.category);
    setDescription(transaction.description);
    setDate(transaction.date);
    setVersion(transaction.updated_at);
  }

  // Seed the form once the transaction being edited has loaded.
  useEffect(() => {
    if (!isEditMode || !existingTransaction.data) return;
    fillFrom(existingTransaction.data);
  }, [isEditMode, existingTransaction.data]);

  const availableCategories = useMemo(
    () => categories.data?.filter((category) => category.type === type) ?? [],
    [categories.data, type]
  );

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    // The previously selected category almost certainly doesn't match the
    // new type (backend rejects that combination), so force a re-pick.
    setCategoryId(null);
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const numericAmount = Number(amount);

    if (!amount.trim()) {
      errors.amount = t("common.validation.amountRequired");
    } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = t("common.validation.amountPositive");
    } else if (!hasValidPrecision(amount, currency)) {
      errors.amount = t("common.validation.noDecimals", { currency });
    }

    if (categoryId === null) {
      errors.category = t("common.validation.categoryRequired");
    }

    if (!date.trim()) {
      errors.date = t("common.validation.dateRequired");
    } else if (!isValidIsoDate(date)) {
      errors.date = t("common.validation.dateInvalid");
    }

    return errors;
  }

  async function handleSave() {
    setErrorMessage(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Only new transactions can be recorded offline; changing an existing one
    // needs the server (it may have changed there meanwhile).
    if (isEditMode && isOffline) {
      setErrorMessage(t("transactions.form.offlineEdit"));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        amount,
        type,
        category: categoryId as number,
        description: description.trim() || undefined,
        date,
      };
      if (transactionId !== null) {
        await updateTransaction(transactionId, payload, version);
      } else {
        const { savedOffline: queued } = await create(payload);
        setSavedOffline(queued);
      }
      setIsSubmitting(false);
      setJustSaved(true);
      // The list/details screens refetch on focus once this modal is
      // dismissed — no manual "update the list" wiring needed here.
      setTimeout(() => router.back(), SUCCESS_DISMISS_DELAY_MS);
    } catch (error) {
      setIsSubmitting(false);
      const latest = conflictCurrent<Transaction>(error);
      if (latest) {
        // Changed on another device since the form was opened: show what is there now.
        fillFrom(latest);
        setFieldErrors({});
        setErrorMessage(t("transactions.form.conflict"));
        return;
      }
      if (isEditMode && isNotFound(error)) {
        setErrorMessage(t("transactions.form.gone"));
        return;
      }
      setFieldErrors((previous) => ({ ...previous, ...extractFieldErrors(error) }));
      setErrorMessage(extractErrorMessage(error));
    }
  }

  return (
    <Screen scroll>
      <SectionState
        isLoading={isEditMode && existingTransaction.isLoading}
        error={isEditMode ? existingTransaction.error : null}
        onRetry={existingTransaction.refetch}
      >
        <ErrorBanner message={errorMessage} />

        {!isEditMode && (
          <View style={styles.scanLink}>
            <Button
              title={t("transactions.form.scanInstead")}
              variant="secondary"
              onPress={() => router.replace("/scan-receipt")}
            />
          </View>
        )}

        <TypeToggle value={type} onChange={handleTypeChange} />

        <TextField
          label={t("common.form.amountIn", { currency })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          autoFocus={!isEditMode}
          value={amount}
          onChangeText={setAmount}
          error={fieldErrors.amount}
        />

        <View style={styles.field}>
          <Text style={styles.label}>{t("common.form.category")}</Text>
          <SectionState
            isLoading={categories.isLoading}
            error={categories.error}
            onRetry={categories.refetch}
          >
            <CategoryChipPicker
              categories={availableCategories}
              selectedId={categoryId}
              onSelect={setCategoryId}
            />
          </SectionState>
          {fieldErrors.category && <Text style={styles.errorText}>{fieldErrors.category}</Text>}
        </View>

        <TextField
          label={t("common.form.description")}
          placeholder={t("common.form.descriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
        />

        <QuickDateField value={date} onChange={setDate} error={fieldErrors.date} />

        <Button
          title={
            justSaved
              ? savedOffline
                ? t("common.savedOffline")
                : t("common.saved")
              : isEditMode
                ? t("common.actions.saveChanges")
                : isOffline
                  ? t("common.saveOffline")
                  : t("common.actions.save")
          }
          variant={justSaved ? "success" : "primary"}
          size="large"
          onPress={handleSave}
          isLoading={isSubmitting}
          disabled={justSaved}
        />
      </SectionState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scanLink: {
    marginBottom: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
});

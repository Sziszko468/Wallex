import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAsyncData } from "../hooks/useAsyncData";
import { listCategories } from "../services/categoriesService";
import { createTransaction } from "../services/transactionsService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../utils/errors";
import { toIsoDate, isValidIsoDate } from "../utils/date";
import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import { SectionState } from "../components/SectionState";
import { TypeToggle } from "../components/TypeToggle";
import { CategoryChipPicker } from "../components/CategoryChipPicker";
import { QuickDateField } from "../components/QuickDateField";
import type { TransactionType } from "../types/category";
import { colors, fontSize, spacing } from "../utils/theme";

/** Small fixed delay so the "Saved ✓" state is actually visible before the
 * modal auto-dismisses — long enough to register, short enough to stay fast. */
const SUCCESS_DISMISS_DELAY_MS = 550;

export function AddTransactionScreen() {
  const categories = useAsyncData(useCallback(() => listCategories(), []));

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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
      errors.amount = "Amount is required.";
    } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = "Amount must be greater than 0.";
    }

    if (categoryId === null) {
      errors.category = "Choose a category.";
    }

    if (!date.trim()) {
      errors.date = "Date is required.";
    } else if (!isValidIsoDate(date)) {
      errors.date = "Enter a valid date (YYYY-MM-DD).";
    }

    return errors;
  }

  async function handleSave() {
    setErrorMessage(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await createTransaction({
        amount,
        type,
        category: categoryId as number,
        description: description.trim() || undefined,
        date,
      });
      setIsSubmitting(false);
      setJustSaved(true);
      // The Dashboard's useFocusEffect refetches automatically once this
      // modal is dismissed — no manual "add to list" wiring needed here.
      setTimeout(() => router.back(), SUCCESS_DISMISS_DELAY_MS);
    } catch (error) {
      setIsSubmitting(false);
      setFieldErrors((previous) => ({ ...previous, ...extractFieldErrors(error) }));
      setErrorMessage(extractErrorMessage(error));
    }
  }

  return (
    <Screen scroll>
      <ErrorBanner message={errorMessage} />

      <TypeToggle value={type} onChange={handleTypeChange} />

      <TextField
        label="Amount"
        placeholder="0.00"
        keyboardType="decimal-pad"
        autoFocus
        value={amount}
        onChangeText={setAmount}
        error={fieldErrors.amount}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Category</Text>
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
        label="Description (optional)"
        placeholder="e.g. Groceries"
        value={description}
        onChangeText={setDescription}
      />

      <QuickDateField value={date} onChange={setDate} error={fieldErrors.date} />

      <Button
        title={justSaved ? "Saved ✓" : "Save"}
        variant={justSaved ? "success" : "primary"}
        size="large"
        onPress={handleSave}
        isLoading={isSubmitting}
        disabled={justSaved}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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

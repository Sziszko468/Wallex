import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAsyncData } from "../hooks/useAsyncData";
import { listCategories } from "../services/categoriesService";
import {
  createRecurringTransaction,
  getRecurringTransaction,
  updateRecurringTransaction,
} from "../services/recurringTransactionsService";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../utils/errors";
import { toIsoDate, isValidIsoDate } from "../utils/date";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { Screen } from "../components/Screen";
import { ErrorBanner } from "../components/ErrorBanner";
import { SectionState } from "../components/SectionState";
import { TypeToggle } from "../components/TypeToggle";
import { CategoryPicker } from "../components/CategoryPicker";
import { QuickDateField } from "../components/QuickDateField";
import { FrequencyPicker } from "../components/recurring/FrequencyPicker";
import { AmountInput } from "../components/ui/AmountInput";
import { AppSwitch } from "../components/ui/AppSwitch";
import { Button } from "../components/ui/Button";
import { ListGroup, ListRow } from "../components/ui/ListRow";
import { Text } from "../components/ui/Text";
import { TextField } from "../components/ui/TextField";
import { makeStyles, space } from "../theme";
import type { TransactionType } from "../types/category";
import type { RecurringFrequency } from "../types/recurringTransaction";
import { normalizeAmountInput } from "../utils/currency";

/** Small fixed delay so the "Saved ✓" state is actually visible before the
 * modal auto-dismisses — long enough to register, short enough to stay fast. */
const SUCCESS_DISMISS_DELAY_MS = 550;

/** Handles both creating a new recurring transaction (no `id` route param)
 * and editing an existing one (`/edit-recurring/[id]`) — mirrors
 * TransactionFormScreen's create/edit dual-mode pattern exactly. */
export function RecurringTransactionFormScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const baseCurrency = useBaseCurrency();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const itemId = id ? Number(id) : null;
  const isEditMode = itemId !== null;

  // Not live: a change on another device must not re-seed the form the user is editing.
  const existingItem = useAsyncData(
    useCallback(() => {
      if (itemId === null) return Promise.resolve(null);
      return getRecurringTransaction(itemId);
    }, [itemId]),
    { live: false }
  );
  const categories = useAsyncData(useCallback(() => listCategories(), []));

  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [startDate, setStartDate] = useState(() => toIsoDate(new Date()));
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!isEditMode || !existingItem.data) return;
    const item = existingItem.data;
    setName(item.name);
    setType(item.type);
    setCategoryId(item.category);
    setAmount(item.amount);
    setFrequency(item.frequency);
    setStartDate(item.start_date);
    setEndDate(item.end_date ?? "");
    setDescription(item.description);
    setIsActive(item.is_active);
  }, [isEditMode, existingItem.data]);

  const availableCategories = useMemo(
    () => categories.data?.filter((category) => category.type === type) ?? [],
    [categories.data, type]
  );

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setCategoryId(null);
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = t("common.validation.nameRequired");

    const normalizedAmount = normalizeAmountInput(amount);
    const numericAmount = Number(normalizedAmount);
    if (!normalizedAmount) {
      errors.amount = t("common.validation.amountRequired");
    } else if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = t("common.validation.amountPositive");
    }

    if (categoryId === null) errors.category = t("common.validation.categoryRequired");

    if (!startDate.trim()) {
      errors.start_date = t("recurring.form.startRequired");
    } else if (!isValidIsoDate(startDate)) {
      errors.start_date = t("common.validation.dateInvalid");
    }

    if (endDate.trim()) {
      if (!isValidIsoDate(endDate)) {
        errors.end_date = t("common.validation.dateInvalid");
      } else if (endDate < startDate) {
        errors.end_date = t("recurring.form.endBeforeStart");
      }
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
      const payload = {
        name: name.trim(),
        category: categoryId as number,
        type,
        amount: normalizeAmountInput(amount),
        frequency,
        start_date: startDate,
        end_date: endDate.trim() || null,
        description: description.trim() || undefined,
        is_active: isActive,
      };
      if (itemId !== null) {
        await updateRecurringTransaction(itemId, payload);
      } else {
        await createRecurringTransaction(payload);
      }
      setIsSubmitting(false);
      setJustSaved(true);
      setTimeout(() => router.back(), SUCCESS_DISMISS_DELAY_MS);
    } catch (error) {
      setIsSubmitting(false);
      setFieldErrors((previous) => ({ ...previous, ...extractFieldErrors(error) }));
      setErrorMessage(extractErrorMessage(error));
    }
  }

  // A new one is recorded in the base currency; an existing one keeps the currency it was created in.
  const currency = existingItem.data?.currency ?? baseCurrency;
  const isFormReady = !(isEditMode && (existingItem.isLoading || existingItem.error));
  const saveLabel = justSaved ? t("common.saved") : isEditMode ? t("common.actions.saveChanges") : t("common.actions.save");

  return (
    <Screen
      scroll
      footer={isFormReady ? <Button title={saveLabel} variant={justSaved ? "success" : "primary"} size="large" onPress={handleSave} isLoading={isSubmitting} disabled={justSaved} /> : undefined}
    >
      <SectionState isLoading={isEditMode && existingItem.isLoading} error={isEditMode ? existingItem.error : null} onRetry={existingItem.refetch}>
        <ErrorBanner message={errorMessage} />

        <TextField
          label={t("common.form.name")}
          placeholder={t("recurring.form.namePlaceholder")}
          autoFocus={!isEditMode}
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
        />

        <TypeToggle value={type} onChange={handleTypeChange} />

        <AmountInput label={t("common.form.amount")} currency={currency} value={amount} onChangeText={setAmount} error={fieldErrors.amount} />

        <View style={styles.section}>
          <Text variant="label" color="textSecondary">
            {t("common.form.category")}
          </Text>
          <SectionState isLoading={categories.isLoading} error={categories.error} onRetry={categories.refetch}>
            <CategoryPicker categories={availableCategories} selectedId={categoryId} onSelect={setCategoryId} />
          </SectionState>
          {fieldErrors.category ? (
            <Text variant="caption" color="danger" accessibilityRole="alert">
              {fieldErrors.category}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text variant="label" color="textSecondary">
            {t("recurring.form.frequency")}
          </Text>
          <FrequencyPicker value={frequency} onChange={setFrequency} />
        </View>

        <QuickDateField label={t("recurring.form.startDate")} value={startDate} onChange={setStartDate} error={fieldErrors.start_date} />

        <TextField
          label={t("recurring.form.endDate")}
          placeholder={t("common.form.datePlaceholder")}
          autoCapitalize="none"
          maxLength={10}
          value={endDate}
          onChangeText={setEndDate}
          error={fieldErrors.end_date}
        />

        <TextField
          label={t("common.form.description")}
          placeholder={t("recurring.form.descriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
        />

        <ListGroup hasIcons={false}>
          <ListRow
            title={t("recurring.form.active")}
            trailing={<AppSwitch accessibilityLabel={t("recurring.form.active")} value={isActive} onValueChange={setIsActive} />}
          />
        </ListGroup>
      </SectionState>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  section: { gap: space[3], marginBottom: space[5] },
}));

import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { ErrorBanner } from "../ErrorBanner";
import { CategoryChipPicker } from "../CategoryChipPicker";
import { QuickDateField } from "../QuickDateField";
import { isValidIsoDate, toIsoDate } from "../../utils/date";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { colors, fontSize, radius, spacing } from "../../utils/theme";
import type { Category } from "../../types/category";
import type { ReceiptScan, ScannedField } from "../../types/receipt";

export interface ConfirmedReceipt {
  merchant: string;
  amount: string;
  date: string;
  category: number;
}

interface ReceiptConfirmationProps {
  scan: ReceiptScan;
  categories: Category[];
  isOffline: boolean;
  onSave: (receipt: ConfirmedReceipt) => Promise<{ savedOffline: boolean }>;
  onRetake: () => void;
}

function hintFor(field: ScannedField<string>, missing: string): string | undefined {
  if (field.value === null) return missing;
  if (field.confidence === "low") return "We weren't sure about this — please check it.";
  return undefined;
}

/**
 * The mandatory review step: every scanned value is only a suggestion, and
 * nothing is saved until the user has seen (and possibly corrected) all four
 * fields and pressed Save.
 */
export function ReceiptConfirmation({ scan, categories, isOffline, onSave, onRetake }: ReceiptConfirmationProps) {
  const [merchant, setMerchant] = useState(scan.merchant.value ?? "");
  const [amount, setAmount] = useState(scan.amount.value ?? "");
  const [date, setDate] = useState(scan.date.value ?? toIsoDate(new Date()));
  const [categoryId, setCategoryId] = useState<number | null>(
    scan.category && categories.some((category) => category.id === scan.category?.id) ? scan.category.id : null
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const expenseCategories = useMemo(() => categories.filter((category) => category.type === "expense"), [categories]);

  const hints = {
    merchant: hintFor(scan.merchant, "Merchant not found on the receipt — please enter it."),
    amount: hintFor(scan.amount, "Total not found on the receipt — please enter it."),
    date: hintFor(scan.date, "Date not found on the receipt — set to today, please check."),
  };
  const categoryHint =
    categoryId === null
      ? "Choose a category."
      : scan.category?.id === categoryId
        ? scan.category.source === "history"
          ? "Suggested: what you chose for this merchant last time."
          : "Suggested from the merchant name."
        : undefined;

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const numericAmount = Number(amount.replace(",", "."));
    if (!merchant.trim()) errors.merchant = "Merchant is required.";
    if (!amount.trim()) errors.amount = "Amount is required.";
    else if (!Number.isFinite(numericAmount) || numericAmount <= 0) errors.amount = "Amount must be greater than 0.";
    if (!isValidIsoDate(date)) errors.date = "Enter a valid date (YYYY-MM-DD).";
    if (categoryId === null) errors.category = "Choose a category.";
    return errors;
  }

  async function handleSave() {
    setErrorMessage(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || categoryId === null) return;

    setIsSaving(true);
    try {
      const { savedOffline } = await onSave({
        merchant: merchant.trim(),
        amount: amount.trim().replace(",", "."),
        date,
        category: categoryId,
      });
      setSavedLabel(savedOffline ? "Saved offline — will sync ✓" : "Saved ✓");
    } catch (error) {
      // The backend validates again — show its field errors next to the fields.
      const serverErrors = extractFieldErrors(error);
      // The merchant is stored as the transaction's description.
      if (serverErrors.description) serverErrors.merchant = serverErrors.description;
      setFieldErrors(serverErrors);
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View>
      <Text style={styles.heading}>Check the details</Text>
      <Text style={styles.subheading}>
        {scan.text_found
          ? "Nothing is saved until you press Save."
          : "We couldn't read any text on this photo. Enter the details yourself, or retake it in better light."}
      </Text>
      <ErrorBanner message={errorMessage} />

      <Field hint={hints.merchant}>
        <TextField label="Merchant" value={merchant} onChangeText={setMerchant} error={fieldErrors.merchant} />
      </Field>
      <Field hint={hints.amount}>
        <TextField
          label="Amount"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          error={fieldErrors.amount}
        />
      </Field>
      <Field hint={hints.date}>
        <QuickDateField value={date} onChange={setDate} error={fieldErrors.date} />
      </Field>

      <View style={styles.field}>
        <Text style={styles.label}>Category</Text>
        <CategoryChipPicker categories={expenseCategories} selectedId={categoryId} onSelect={setCategoryId} />
        {fieldErrors.category ? (
          <Text style={styles.errorText}>{fieldErrors.category}</Text>
        ) : (
          categoryHint && <Text style={styles.suggestion}>{categoryHint}</Text>
        )}
      </View>

      <Button
        title={savedLabel ?? (isOffline ? "Save offline" : "Save")}
        variant={savedLabel ? "success" : "primary"}
        size="large"
        onPress={handleSave}
        isLoading={isSaving}
        disabled={savedLabel !== null}
      />
      <View style={styles.spacer} />
      <Button title="Retake photo" variant="secondary" onPress={onRetake} disabled={isSaving || savedLabel !== null} />
    </View>
  );
}

function Field({ hint, children }: { hint?: string; children: ReactNode }) {
  return (
    <View style={hint ? styles.flagged : undefined}>
      {hint && <Text style={styles.hint}>⚠ {hint}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
  },
  subheading: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  flagged: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    paddingLeft: spacing.sm,
    borderRadius: radius.sm,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: "600",
    marginBottom: spacing.xs,
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
  suggestion: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  spacer: {
    height: spacing.sm,
  },
});

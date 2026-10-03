import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { t } from "i18next";
import { APP_NAME } from "../../config/app";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { ErrorBanner } from "../ErrorBanner";
import { CategoryChipPicker } from "../CategoryChipPicker";
import { CurrencyChipPicker } from "../CurrencyChipPicker";
import { QuickDateField } from "../QuickDateField";
import { isValidIsoDate, toIsoDate } from "../../utils/date";
import { hasValidPrecision, normalizeAmountInput } from "../../utils/currency";
import { formatCurrency } from "../../utils/format";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
import { colors, fontSize, radius, spacing } from "../../utils/theme";
import type { Category } from "../../types/category";
import type { CurrencyCode } from "../../types/currency";
import type { ReceiptScan, ScannedField } from "../../types/receipt";

export interface ConfirmedReceipt {
  merchant: string;
  amount: string;
  currency: CurrencyCode;
  date: string;
  category: number;
}

interface ReceiptConfirmationProps {
  scan: ReceiptScan;
  categories: Category[];
  /** Preselected when the receipt shows no supported currency. */
  baseCurrency: CurrencyCode;
  isOffline: boolean;
  onSave: (receipt: ConfirmedReceipt) => Promise<{ savedOffline: boolean }>;
  onRetake: () => void;
}

function hintFor(field: ScannedField<string>, missing: string): string | undefined {
  if (field.value === null) return missing;
  if (field.confidence === "low") return t("receipts.confirm.hints.lowConfidence");
  return undefined;
}

function currencyHint(scan: ReceiptScan, baseCurrency: CurrencyCode): string | undefined {
  if (scan.unsupported_currency) {
    return t("receipts.confirm.hints.currencyUnsupported", { currency: scan.unsupported_currency, appName: APP_NAME });
  }
  if (scan.currency.value === null) return t("receipts.confirm.hints.currencyMissing", { currency: baseCurrency });
  if (scan.currency.confidence === "low") return t("receipts.confirm.hints.currencyMixed");
  return undefined;
}

/**
 * The mandatory review step: every scanned value is only a suggestion, and
 * nothing is saved until the user has seen (and possibly corrected) all five
 * fields and pressed Save.
 */
export function ReceiptConfirmation({
  scan,
  categories,
  baseCurrency,
  isOffline,
  onSave,
  onRetake,
}: ReceiptConfirmationProps) {
  const { t } = useTranslation();
  const [merchant, setMerchant] = useState(scan.merchant.value ?? "");
  const [amount, setAmount] = useState(scan.amount.value ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(scan.currency.value ?? baseCurrency);
  const [date, setDate] = useState(scan.date.value ?? toIsoDate(new Date()));
  const [categoryId, setCategoryId] = useState<number | null>(
    scan.category && categories.some((category) => category.id === scan.category?.id) ? scan.category.id : null
  );
  const [showItems, setShowItems] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const expenseCategories = useMemo(() => categories.filter((category) => category.type === "expense"), [categories]);

  const hints = {
    merchant: hintFor(scan.merchant, t("receipts.confirm.hints.merchantMissing")),
    amount: hintFor(scan.amount, t("receipts.confirm.hints.amountMissing")),
    currency: currencyHint(scan, baseCurrency),
    date: hintFor(scan.date, t("receipts.confirm.hints.dateMissing")),
  };
  const categoryHint =
    categoryId === null
      ? t("common.validation.categoryRequired")
      : scan.category?.id === categoryId
        ? scan.category.source === "history"
          ? t("receipts.confirm.hints.categoryFromHistory")
          : t("receipts.confirm.hints.categoryFromName")
        : undefined;
  // Items are printed in the receipt's own currency (when it's one we know).
  const itemCurrency = scan.currency.value ?? currency;

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const normalizedAmount = normalizeAmountInput(amount);
    const numericAmount = Number(normalizedAmount);
    if (!merchant.trim()) errors.merchant = t("receipts.confirm.errors.merchantRequired");
    if (!amount.trim()) errors.amount = t("common.validation.amountRequired");
    else if (!Number.isFinite(numericAmount) || numericAmount <= 0) errors.amount = t("common.validation.amountPositive");
    else if (!hasValidPrecision(normalizedAmount, currency)) errors.amount = t("common.validation.noDecimals", { currency });
    if (!isValidIsoDate(date)) errors.date = t("common.validation.dateInvalid");
    if (categoryId === null) errors.category = t("common.validation.categoryRequired");
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
        amount: normalizeAmountInput(amount),
        currency,
        date,
        category: categoryId,
      });
      setSavedLabel(savedOffline ? t("common.savedOffline") : t("common.saved"));
    } catch (error) {
      // The backend validates again — show its field errors next to the fields.
      const serverErrors = extractFieldErrors(error);
      // The merchant is stored as the transaction's description.
      if (serverErrors.description) serverErrors.merchant = serverErrors.description;
      // A missing exchange rate is about the chosen currency.
      if (serverErrors.exchange_rate) serverErrors.currency = serverErrors.exchange_rate;
      setFieldErrors(serverErrors);
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View>
      <Text style={styles.heading}>{t("receipts.confirm.heading")}</Text>
      <Text style={styles.subheading}>
        {scan.text_found ? t("receipts.confirm.subFound") : t("receipts.confirm.subNone")}
      </Text>
      <ErrorBanner message={errorMessage} />

      <Field hint={hints.merchant}>
        <TextField label={t("receipts.confirm.merchant")} value={merchant} onChangeText={setMerchant} error={fieldErrors.merchant} />
      </Field>
      <Field hint={hints.amount}>
        <TextField
          label={t("common.form.amount")}
          placeholder={currency === "HUF" || currency === "JPY" ? "0" : "0.00"}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          error={fieldErrors.amount}
        />
      </Field>
      <Field hint={hints.currency}>
        <View style={styles.field}>
          <Text style={styles.label}>{t("receipts.confirm.currency")}</Text>
          <CurrencyChipPicker selected={currency} onSelect={setCurrency} />
          {fieldErrors.currency && <Text style={styles.errorText}>{fieldErrors.currency}</Text>}
        </View>
      </Field>
      <Field hint={hints.date}>
        <QuickDateField value={date} onChange={setDate} error={fieldErrors.date} />
      </Field>

      <View style={styles.field}>
        <Text style={styles.label}>{t("common.form.category")}</Text>
        <CategoryChipPicker categories={expenseCategories} selectedId={categoryId} onSelect={setCategoryId} />
        {fieldErrors.category ? (
          <Text style={styles.errorText}>{fieldErrors.category}</Text>
        ) : (
          categoryHint && <Text style={styles.suggestion}>{categoryHint}</Text>
        )}
      </View>

      {scan.items.length > 0 && (
        <View style={styles.field}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showItems }}
            onPress={() => setShowItems((shown) => !shown)}
          >
            <Text style={styles.itemsToggle}>
              {showItems ? "▾" : "▸"} {t("receipts.confirm.items", { count: scan.items.length })}
            </Text>
          </Pressable>
          {showItems && (
            <View style={styles.items}>
              <Text style={styles.itemsNote}>{t("receipts.confirm.itemsNote")}</Text>
              {scan.items.map((item, index) => (
                <View key={`${index}-${item.name}`} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemAmount}>{formatCurrency(item.amount, itemCurrency)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Button
        title={savedLabel ?? (isOffline ? t("common.saveOffline") : t("receipts.confirm.save"))}
        variant={savedLabel ? "success" : "primary"}
        size="large"
        onPress={handleSave}
        isLoading={isSaving}
        disabled={savedLabel !== null}
      />
      <View style={styles.spacer} />
      <Button title={t("receipts.confirm.retake")} variant="secondary" onPress={onRetake} disabled={isSaving || savedLabel !== null} />
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
  itemsToggle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.primary,
    paddingVertical: spacing.xs,
  },
  items: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  itemsNote: {
    fontSize: 12,
    color: colors.textMuted,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  itemAmount: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
  },
  spacer: {
    height: spacing.sm,
  },
});

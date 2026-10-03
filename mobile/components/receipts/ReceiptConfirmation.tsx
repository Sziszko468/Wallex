import { useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { t } from "i18next";
import { APP_NAME } from "../../config/app";
import { makeStyles, radius, space, useTheme } from "../../theme";
import { CategoryPicker } from "../CategoryPicker";
import { CurrencyChipPicker } from "../CurrencyChipPicker";
import { ErrorBanner } from "../ErrorBanner";
import { QuickDateField } from "../QuickDateField";
import { Icon } from "../icons/Icon";
import { AmountInput } from "../ui/AmountInput";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { isValidIsoDate, toIsoDate } from "../../utils/date";
import { hasValidPrecision, normalizeAmountInput } from "../../utils/currency";
import { formatCurrency } from "../../utils/format";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../../utils/errors";
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
  const styles = useStyles();
  const { colors } = useTheme();
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
      <View style={styles.intro}>
        <Text variant="title" header>
          {t("receipts.confirm.heading")}
        </Text>
        <Text variant="body" color="textSecondary">
          {scan.text_found ? t("receipts.confirm.subFound") : t("receipts.confirm.subNone")}
        </Text>
      </View>
      <ErrorBanner message={errorMessage} />

      <Field hint={hints.merchant}>
        <TextField label={t("receipts.confirm.merchant")} value={merchant} onChangeText={setMerchant} error={fieldErrors.merchant} />
      </Field>
      <Field hint={hints.amount}>
        <AmountInput label={t("common.form.amount")} currency={currency} value={amount} onChangeText={setAmount} error={fieldErrors.amount} />
      </Field>
      <Field hint={hints.currency}>
        <View style={styles.field}>
          <Text variant="label" color="textSecondary">
            {t("receipts.confirm.currency")}
          </Text>
          <CurrencyChipPicker selected={currency} onSelect={setCurrency} />
          {fieldErrors.currency ? (
            <Text variant="caption" color="danger">
              {fieldErrors.currency}
            </Text>
          ) : null}
        </View>
      </Field>
      <Field hint={hints.date}>
        <QuickDateField value={date} onChange={setDate} error={fieldErrors.date} />
      </Field>

      <View style={styles.field}>
        <Text variant="label" color="textSecondary">
          {t("common.form.category")}
        </Text>
        <CategoryPicker categories={expenseCategories} selectedId={categoryId} onSelect={setCategoryId} />
        {fieldErrors.category ? (
          <Text variant="caption" color="danger">
            {fieldErrors.category}
          </Text>
        ) : categoryHint ? (
          <Text variant="caption" color="primaryInk">
            {categoryHint}
          </Text>
        ) : null}
      </View>

      {scan.items.length > 0 ? (
        <View style={styles.field}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("receipts.confirm.items", { count: scan.items.length })}
            accessibilityState={{ expanded: showItems }}
            onPress={() => setShowItems((shown) => !shown)}
            style={styles.itemsToggle}
          >
            <Icon name={showItems ? "chevron-down" : "chevron-right"} size={18} color={colors.primaryInk} />
            <Text variant="label" color="primaryInk">
              {t("receipts.confirm.items", { count: scan.items.length })}
            </Text>
          </Pressable>
          {showItems ? (
            <View style={styles.items}>
              <Text variant="caption" color="textSecondary">
                {t("receipts.confirm.itemsNote")}
              </Text>
              {scan.items.map((item, index) => (
                <View key={`${index}-${item.name}`} style={styles.itemRow}>
                  <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    {item.name}
                  </Text>
                  <Text variant="amount">{formatCurrency(item.amount, itemCurrency)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={savedLabel ?? (isOffline ? t("common.saveOffline") : t("receipts.confirm.save"))}
          variant={savedLabel ? "success" : "primary"}
          size="large"
          onPress={handleSave}
          isLoading={isSaving}
          disabled={savedLabel !== null}
        />
        <Button title={t("receipts.confirm.retake")} variant="ghost" icon="camera" onPress={onRetake} disabled={isSaving || savedLabel !== null} />
      </View>
    </View>
  );
}

function Field({ hint, children }: { hint?: string; children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      {hint ? (
        <View style={styles.hint}>
          <Icon name="alert-triangle" size={16} color={colors.warning} />
          <Text variant="caption" color="warning" style={{ flex: 1 }}>
            {hint}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  intro: { gap: space[2], marginBottom: space[5] },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: space[2], padding: space[3], marginBottom: space[2], borderRadius: radius.md, backgroundColor: colors.warningSoft },
  field: { gap: space[3], marginBottom: space[5] },
  itemsToggle: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 44 },
  items: { gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: colors.surfaceSubtle },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  actions: { gap: space[2], marginTop: space[2] },
}));

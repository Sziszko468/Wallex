import type { SelectHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import type { CurrencyCode } from "../types/currency";
import { CURRENCY_CODES, currencyName, isCurrencyCode } from "../utils/currency";
import { Select } from "./Select";

interface CurrencySelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "value" | "onChange"> {
  label?: string;
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  error?: string;
}

export function CurrencySelect({ label, value, onChange, error, ...rest }: CurrencySelectProps) {
  const { t } = useTranslation();
  const options = CURRENCY_CODES.map((code) => ({ value: code, label: `${code} — ${currencyName(code)}` }));

  return (
    <Select
      label={label ?? t("common.currency.label")}
      options={options}
      value={value}
      error={error}
      onChange={(event) => {
        if (isCurrencyCode(event.target.value)) onChange(event.target.value);
      }}
      {...rest}
    />
  );
}

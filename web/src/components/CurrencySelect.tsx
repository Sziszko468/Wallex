import type { SelectHTMLAttributes } from "react";
import type { CurrencyCode } from "../types/currency";
import { CURRENCIES, CURRENCY_CODES, isCurrencyCode } from "../utils/currency";
import { Select } from "./Select";

interface CurrencySelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "value" | "onChange"> {
  label?: string;
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  error?: string;
}

const OPTIONS = CURRENCY_CODES.map((code) => ({ value: code, label: `${code} — ${CURRENCIES[code].name}` }));

export function CurrencySelect({ label = "Currency", value, onChange, error, ...rest }: CurrencySelectProps) {
  return (
    <Select
      label={label}
      options={OPTIONS}
      value={value}
      error={error}
      onChange={(event) => {
        if (isCurrencyCode(event.target.value)) onChange(event.target.value);
      }}
      {...rest}
    />
  );
}

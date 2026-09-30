import { useId, type SelectHTMLAttributes } from "react";
import { Icon } from "./icons/Icon";
import { FieldMessages } from "./FieldMessages";
import styles from "./Field.module.scss";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  options: SelectOption[];
  error?: string;
  hint?: string;
  placeholder?: string;
  /** Keeps the label for screen readers but doesn't draw it (compact filter bars). */
  hideLabel?: boolean;
}

export function Select({ label, options, error, hint, placeholder, hideLabel = false, id, className, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = [hint ? `${selectId}-hint` : "", error ? `${selectId}-error` : ""].filter(Boolean).join(" ");

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={selectId} className={hideLabel ? styles.visuallyHidden : styles.label}>
        {label}
      </label>
      <div className={error ? `${styles.control} ${styles.invalid}` : styles.control}>
        <select
          id={selectId}
          className={`${styles.input} ${styles.select}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={18} className={styles.chevron} />
      </div>
      <FieldMessages id={selectId} hint={hint} error={error} />
    </div>
  );
}

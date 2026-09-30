import { useId, type InputHTMLAttributes } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import { FieldMessages } from "./FieldMessages";
import styles from "./Field.module.scss";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** An icon inside the field, before the text (search). */
  leadingIcon?: IconName;
  /** "amount" is the big, confident input used for money. */
  variant?: "default" | "amount";
  /** Keeps the label for screen readers but doesn't draw it (compact filter bars). */
  hideLabel?: boolean;
}

export function TextField({
  label,
  error,
  hint,
  leadingIcon,
  variant = "default",
  hideLabel = false,
  id,
  className,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = [hint ? `${inputId}-hint` : "", error ? `${inputId}-error` : ""].filter(Boolean).join(" ");

  const fieldClasses = [styles.field, variant === "amount" ? styles.amount : "", className].filter(Boolean).join(" ");
  const controlClasses = [styles.control, error ? styles.invalid : ""].filter(Boolean).join(" ");

  return (
    <div className={fieldClasses}>
      <label htmlFor={inputId} className={hideLabel ? styles.visuallyHidden : styles.label}>
        {label}
      </label>
      <div className={controlClasses}>
        {leadingIcon && <Icon name={leadingIcon} size={18} className={styles.leadingIcon} />}
        <input
          id={inputId}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...rest}
        />
      </div>
      <FieldMessages id={inputId} hint={hint} error={error} />
    </div>
  );
}

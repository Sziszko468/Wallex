import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./icons/Icon";
import styles from "./Checkbox.module.scss";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: string;
}

export function Checkbox({ label, hint, id, className, ...rest }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <label htmlFor={inputId} className={styles.label}>
        <input id={inputId} type="checkbox" className={styles.input} aria-describedby={hint ? `${inputId}-hint` : undefined} {...rest} />
        <span className={styles.box} aria-hidden="true">
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
        <span>{label}</span>
      </label>
      {hint && (
        <p id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonStyles";
import styles from "./Button.module.scss";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches the button to its container (forms on narrow screens). */
  fullWidth?: boolean;
  /** Shows a spinner and disables the button; the label stays so the layout doesn't jump. */
  isLoading?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  disabled,
  leadingIcon,
  trailingIcon,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : leadingIcon && <Icon name={leadingIcon} size={18} />}
      {children && <span className={styles.label}>{children}</span>}
      {trailingIcon && !isLoading && <Icon name={trailingIcon} size={18} />}
    </button>
  );
}

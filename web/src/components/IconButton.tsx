import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import styles from "./IconButton.module.scss";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  icon: IconName;
  /** Required: what the button does. Used as the accessible name and the hover tooltip. */
  label: string;
  variant?: "ghost" | "outline" | "danger";
  size?: "sm" | "md";
}

/** An icon-only button (44px target by default) with a mandatory accessible name. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size === "sm" ? 16 : 18} />
    </button>
  );
}

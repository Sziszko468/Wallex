import type { ReactNode } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import styles from "./Badge.module.scss";

export type BadgeTone = "neutral" | "primary" | "success" | "danger" | "warning" | "info" | "savings";

interface BadgeProps {
  tone?: BadgeTone;
  /** "outline" is the quiet variant (paused, archived). */
  variant?: "soft" | "outline";
  icon?: IconName;
  children: ReactNode;
  className?: string;
}

/** A small status label. Colour is reinforced by the text (and optional icon) — never alone. */
export function Badge({ tone = "neutral", variant = "soft", icon, children, className }: BadgeProps) {
  const classes = [styles.badge, styles[tone], variant === "outline" ? styles.outline : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

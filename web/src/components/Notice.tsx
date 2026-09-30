import type { ReactNode } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconPaths";
import styles from "./Notice.module.scss";

type NoticeTone = "info" | "success" | "warning";

const TONE_ICONS: Record<NoticeTone, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
};

interface NoticeProps {
  tone?: NoticeTone;
  /** Announced politely when it appears ("status"), or left silent ("note"). */
  role?: "status" | "note";
  children: ReactNode;
}

/** A short, calm message inline with the content — not an error (those use ErrorBanner). */
export function Notice({ tone = "info", role = "status", children }: NoticeProps) {
  return (
    <p className={`${styles.notice} ${styles[tone]}`} role={role}>
      <Icon name={TONE_ICONS[tone]} size={18} className={styles.icon} />
      {children}
    </p>
  );
}

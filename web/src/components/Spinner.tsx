import { useTranslation } from "react-i18next";
import { BrandMark } from "./icons/BrandMark";
import styles from "./Spinner.module.scss";

const BRAND_MARK_SIZE = { page: 40, inline: 22 } as const;

interface SpinnerProps {
  fullPage?: boolean;
  label?: string;
}

/** The app's loading indicator: the brand ring, slowly turning. */
export function Spinner({ fullPage = false, label }: SpinnerProps) {
  const { t } = useTranslation();
  const content = (
    <div className={styles.spinner} role="status" aria-live="polite">
      <span className={styles.ring}>
        <BrandMark size={fullPage ? BRAND_MARK_SIZE.page : BRAND_MARK_SIZE.inline} />
      </span>
      <span className={styles.label}>{label ?? t("common.states.loading")}</span>
    </div>
  );

  if (!fullPage) return content;

  return <div className={styles.fullPage}>{content}</div>;
}

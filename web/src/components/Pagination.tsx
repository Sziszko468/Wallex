import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import styles from "./Pagination.module.scss";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, totalCount, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalPages <= 1) return null;

  return (
    <nav className={styles.pagination} aria-label={t("common.pagination.label")}>
      <Button variant="secondary" size="sm" leadingIcon="chevron-left" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        {t("common.actions.previous")}
      </Button>
      <span className={styles.status}>
        {t("common.pagination.status", { page, totalPages, totalCount })}
      </span>
      <Button variant="secondary" size="sm" trailingIcon="chevron-right" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        {t("common.actions.next")}
      </Button>
    </nav>
  );
}

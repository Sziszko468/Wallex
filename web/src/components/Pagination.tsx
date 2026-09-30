import { Button } from "./Button";
import styles from "./Pagination.module.scss";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, totalCount, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalPages <= 1) return null;

  return (
    <nav className={styles.pagination} aria-label="Transactions pagination">
      <Button variant="secondary" size="sm" leadingIcon="chevron-left" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Previous
      </Button>
      <span className={styles.status}>
        Page {page} of {totalPages} · {totalCount} total
      </span>
      <Button variant="secondary" size="sm" trailingIcon="chevron-right" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Next
      </Button>
    </nav>
  );
}

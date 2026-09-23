import type { ImportSummary } from "../../types/csvImport";
import styles from "./ImportResultSummary.module.scss";

interface ImportResultSummaryProps {
  summary: ImportSummary;
}

export function ImportResultSummary({ summary }: ImportResultSummaryProps) {
  return (
    <div>
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.label}>Imported</span>
          <span className={`${styles.value} ${styles.success}`}>{summary.imported}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Skipped</span>
          <span className={`${styles.value} ${styles.warning}`}>{summary.skipped}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Failed</span>
          <span className={`${styles.value} ${styles.danger}`}>{summary.failed}</span>
        </div>
      </div>

      {summary.details.length > 0 && (
        <div className={styles.detailsWrapper}>
          <table className={styles.detailsTable}>
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Status</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {summary.details.map((detail) => (
                <tr key={detail.row}>
                  <td>{detail.row}</td>
                  <td>
                    <span
                      className={
                        detail.status === "failed" ? styles.statusFailed : styles.statusSkipped
                      }
                    >
                      {detail.status === "failed" ? "Failed" : "Skipped"}
                    </span>
                  </td>
                  <td>{detail.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

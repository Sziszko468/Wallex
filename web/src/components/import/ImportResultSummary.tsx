import type { ImportSummary } from "../../types/csvImport";
import { Badge } from "../Badge";
import { SummaryStrip } from "../SummaryStrip";
import styles from "./ImportResultSummary.module.scss";

interface ImportResultSummaryProps {
  summary: ImportSummary;
}

export function ImportResultSummary({ summary }: ImportResultSummaryProps) {
  return (
    <div className={styles.result}>
      <SummaryStrip
        items={[
          { label: "Imported", value: String(summary.imported), tone: "positive" },
          { label: "Skipped", value: String(summary.skipped), tone: summary.skipped > 0 ? "warning" : undefined },
          { label: "Failed", value: String(summary.failed), tone: summary.failed > 0 ? "negative" : undefined },
        ]}
      />

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
                    <Badge tone={detail.status === "failed" ? "danger" : "warning"} icon={detail.status === "failed" ? "alert-circle" : "alert-triangle"}>
                      {detail.status === "failed" ? "Failed" : "Skipped"}
                    </Badge>
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

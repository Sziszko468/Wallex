import { useTranslation } from "react-i18next";
import type { ImportSummary } from "../../types/csvImport";
import { Badge } from "../Badge";
import { SummaryStrip } from "../SummaryStrip";
import styles from "./ImportResultSummary.module.scss";

interface ImportResultSummaryProps {
  summary: ImportSummary;
}

export function ImportResultSummary({ summary }: ImportResultSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.result}>
      <SummaryStrip
        items={[
          { label: t("importCsv.result.imported"), value: String(summary.imported), tone: "positive" },
          { label: t("importCsv.result.skipped"), value: String(summary.skipped), tone: summary.skipped > 0 ? "warning" : undefined },
          { label: t("importCsv.result.failed"), value: String(summary.failed), tone: summary.failed > 0 ? "negative" : undefined },
        ]}
      />

      {summary.details.length > 0 && (
        <div className={styles.detailsWrapper}>
          <table className={styles.detailsTable}>
            <thead>
              <tr>
                <th scope="col">{t("importCsv.result.row")}</th>
                <th scope="col">{t("common.labels.status")}</th>
                <th scope="col">{t("importCsv.result.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.details.map((detail) => (
                <tr key={detail.row}>
                  <td>{detail.row}</td>
                  <td>
                    <Badge tone={detail.status === "failed" ? "danger" : "warning"} icon={detail.status === "failed" ? "alert-circle" : "alert-triangle"}>
                      {detail.status === "failed" ? t("importCsv.result.failed") : t("importCsv.result.skipped")}
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

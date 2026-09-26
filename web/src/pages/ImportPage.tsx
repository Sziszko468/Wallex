import { useRef, useState, type ChangeEvent } from "react";
import { importTransactionsCsv } from "../services/csvImportService";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { extractErrorMessage } from "../utils/errors";
import type { ImportSummary } from "../types/csvImport";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { ImportResultSummary } from "../components/import/ImportResultSummary";
import styles from "./ImportPage.module.scss";

export function ImportPage() {
  const baseCurrency = useBaseCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setSummary(null);
    setErrorMessage(null);
  }

  async function handleImport() {
    if (!selectedFile) return;
    setIsUploading(true);
    setErrorMessage(null);
    setSummary(null);
    try {
      const result = await importTransactionsCsv(selectedFile);
      setSummary(result);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Import Transactions</h1>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Upload a CSV file</h2>
        <p className={styles.helpText}>
          Expected columns: <code>date</code>, <code>description</code>, <code>amount</code>.
          Dates as <code>YYYY-MM-DD</code> or <code>DD/MM/YYYY</code>. Amount is signed —
          negative for expenses, positive for income (e.g. <code>-42.50</code>), in your base currency
          ({baseCurrency}). Categories are
          detected automatically from the description (e.g. "Albert Heijn" → Food, "Shell" →
          Transport, "Netflix" → Entertainment); an unmatched expense falls back to "Other".
        </p>

        <ErrorBanner message={errorMessage} />

        <div className={styles.uploadRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className={styles.fileInput}
            id="csv-file-input"
          />
          <label htmlFor="csv-file-input" className={styles.fileLabel}>
            {selectedFile ? selectedFile.name : "Choose CSV file"}
          </label>
          <Button
            type="button"
            onClick={handleImport}
            isLoading={isUploading}
            disabled={!selectedFile}
          >
            Import
          </Button>
        </div>
      </div>

      {summary && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Import result</h2>
          <ImportResultSummary summary={summary} />
        </div>
      )}
    </div>
  );
}

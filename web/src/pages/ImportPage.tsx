import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { importTransactionsCsv } from "../services/csvImportService";
import { useBaseCurrency } from "../hooks/useBaseCurrency";
import { usePageTitle } from "../hooks/usePageTitle";
import { extractErrorMessage } from "../utils/errors";
import type { ImportSummary } from "../types/csvImport";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ErrorBanner } from "../components/ErrorBanner";
import { Icon } from "../components/icons/Icon";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { ImportResultSummary } from "../components/import/ImportResultSummary";
import pageStyles from "../components/page.module.scss";
import styles from "./ImportPage.module.scss";

export function ImportPage() {
  usePageTitle("Import");
  const baseCurrency = useBaseCurrency();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function selectFile(file: File | null) {
    setSelectedFile(file);
    setSummary(null);
    setErrorMessage(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMessage("That doesn't look like a CSV file. Choose a file ending in .csv.");
      return;
    }
    selectFile(file);
  }

  async function handleImport() {
    if (!selectedFile) return;
    setIsUploading(true);
    setErrorMessage(null);
    setSummary(null);
    try {
      const result = await importTransactionsCsv(selectedFile);
      setSummary(result);
      toast.success(`${result.imported} transaction${result.imported === 1 ? "" : "s"} imported`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Import transactions"
        description="Bring in a CSV file from your bank or another app."
      />

      <Card padding="lg" className={styles.card}>
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

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className={styles.fileInput}
          id="csv-file-input"
        />
        <label
          htmlFor="csv-file-input"
          className={isDragging ? `${styles.dropzone} ${styles.dragging}` : styles.dropzone}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <span className={styles.dropIcon} aria-hidden="true">
            <Icon name={selectedFile ? "file" : "upload"} size={24} />
          </span>
          <span className={styles.dropTitle}>{selectedFile ? selectedFile.name : "Choose CSV file"}</span>
          <span className={styles.dropHint}>{selectedFile ? "Ready to import" : "or drag and drop it here"}</span>
        </label>

        <Button
          type="button"
          leadingIcon="upload"
          onClick={handleImport}
          isLoading={isUploading}
          disabled={!selectedFile}
          className={styles.importButton}
        >
          Import
        </Button>
      </Card>

      {summary && (
        <Card padding="lg" className={styles.card}>
          <h2 className={styles.cardTitle}>Import result</h2>
          <ImportResultSummary summary={summary} />
        </Card>
      )}
    </div>
  );
}

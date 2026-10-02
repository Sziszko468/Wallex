import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CSV_EXTENSION } from "../config/csvImport";
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
  const { t } = useTranslation();
  usePageTitle(t("nav.items.import"));
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
    if (!file.name.toLowerCase().endsWith(CSV_EXTENSION)) {
      setErrorMessage(t("importCsv.notCsv"));
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
      toast.success(t("importCsv.imported", { count: result.imported }));
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
        title={t("importCsv.title")}
        description={t("importCsv.description")}
      />

      <Card padding="lg" className={styles.card}>
        <h2 className={styles.cardTitle}>{t("importCsv.uploadTitle")}</h2>
        <p className={styles.helpText}>
          <Trans i18nKey="importCsv.help" values={{ currency: baseCurrency }} components={{ code: <code /> }} />
        </p>

        <ErrorBanner message={errorMessage} />

        <input
          ref={fileInputRef}
          type="file"
          accept={CSV_EXTENSION}
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
          <span className={styles.dropTitle}>{selectedFile ? selectedFile.name : t("importCsv.choose")}</span>
          <span className={styles.dropHint}>{selectedFile ? t("importCsv.ready") : t("importCsv.dragHint")}</span>
        </label>

        <Button
          type="button"
          leadingIcon="upload"
          onClick={handleImport}
          isLoading={isUploading}
          disabled={!selectedFile}
          className={styles.importButton}
        >
          {t("importCsv.submit")}
        </Button>
      </Card>

      {summary && (
        <Card padding="lg" className={styles.card}>
          <h2 className={styles.cardTitle}>{t("importCsv.resultTitle")}</h2>
          <ImportResultSummary summary={summary} />
        </Card>
      )}
    </div>
  );
}

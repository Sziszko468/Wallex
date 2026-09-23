export interface ImportRowDetail {
  /** Actual line number in the uploaded file (header = line 1). */
  row: number;
  status: "skipped" | "failed";
  reason: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  failed: number;
  /** Only skipped/failed rows — successfully imported rows aren't individually listed. */
  details: ImportRowDetail[];
}

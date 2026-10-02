import axios from "axios";
import { t } from "i18next";
import { APP_NAME } from "../config/app";
import type { ReceiptScan } from "../types/receipt";
import { extractErrorMessage, extractFieldErrors } from "./errors";
import { isOfflineError } from "./network";
import { HTTP_STATUS } from "../config/http";

/** What the user can do next. "review" = go to the confirmation screen and type the details in. */
export type ProblemAction = "retake" | "library" | "manual" | "review";

export type ProblemKind =
  | "bad_image" // not a usable photo: unreadable file, wrong format, too large (400/413)
  | "unreadable" // a photo, but no text on it: blurry, dark, not a document
  | "unsupported" // text, but no total and no date: not a receipt WALLEX can read
  | "ocr_unavailable" // the OCR engine is down (503)
  | "rate_limited" // too many scans this hour (429)
  | "timeout" // the server didn't answer in time
  | "offline" // no connection
  | "unknown";

export interface ScanProblem {
  kind: ProblemKind;
  title: string;
  message: string;
  actions: ProblemAction[];
}

/** Why a scan request failed, and what to offer instead. */
export function problemFromError(error: unknown): ScanProblem {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;

  if (status === HTTP_STATUS.BAD_REQUEST || status === HTTP_STATUS.PAYLOAD_TOO_LARGE) {
    const reason = extractFieldErrors(error).image ?? extractErrorMessage(error);
    return { kind: "bad_image", title: t("receipts.problems.badImage"), message: reason, actions: ["retake", "library", "manual"] };
  }
  if (status === HTTP_STATUS.SERVICE_UNAVAILABLE) {
    return {
      kind: "ocr_unavailable",
      title: t("receipts.problems.ocrUnavailable"),
      message: t("receipts.problems.ocrUnavailableMessage", { reason: extractErrorMessage(error) }),
      actions: ["manual"],
    };
  }
  if (status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    return {
      kind: "rate_limited",
      title: t("receipts.problems.rateLimited"),
      message: t("receipts.problems.rateLimitedMessage"),
      actions: ["manual"],
    };
  }
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
    return {
      kind: "timeout",
      title: t("receipts.problems.timeout"),
      message: t("receipts.problems.timeoutMessage"),
      actions: ["retake", "manual"],
    };
  }
  if (isOfflineError(error)) {
    return {
      kind: "offline",
      title: t("receipts.problems.offline"),
      message: t("receipts.problems.offlineMessage"),
      actions: ["manual"],
    };
  }
  return { kind: "unknown", title: t("receipts.problems.unknown"), message: extractErrorMessage(error), actions: ["retake", "manual"] };
}

/** A successful scan that still can't be reviewed as a receipt; null when it can. */
export function problemFromScan(scan: ReceiptScan): ScanProblem | null {
  if (scan.outcome === "unreadable") {
    return {
      kind: "unreadable",
      title: t("receipts.problems.unreadable"),
      message: t("receipts.problems.unreadableMessage", { tips: t("receipts.problems.photoTips") }),
      actions: ["retake", "library", "manual"],
    };
  }
  if (scan.outcome === "unsupported") {
    return {
      kind: "unsupported",
      title: t("receipts.problems.unsupported"),
      message: t("receipts.problems.unsupportedMessage", { appName: APP_NAME }),
      actions: ["retake", "review", "manual"],
    };
  }
  return null;
}

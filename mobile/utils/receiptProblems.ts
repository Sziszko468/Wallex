import axios from "axios";
import type { ReceiptScan } from "../types/receipt";
import { extractErrorMessage, extractFieldErrors } from "./errors";
import { isOfflineError } from "./network";

/** What the user can do next. "review" = go to the confirmation screen and type the details in. */
export type ProblemAction = "retake" | "library" | "manual" | "review";

export type ProblemKind =
  | "bad_image" // not a usable photo: unreadable file, wrong format, too large (400/413)
  | "unreadable" // a photo, but no text on it: blurry, dark, not a document
  | "unsupported" // text, but no total and no date: not a receipt Spendly can read
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

const PHOTO_TIPS = "Make sure the whole receipt is in the picture, flat and well lit.";

/** Why a scan request failed, and what to offer instead. */
export function problemFromError(error: unknown): ScanProblem {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;

  if (status === 400 || status === 413) {
    const reason = extractFieldErrors(error).image ?? extractErrorMessage(error);
    return { kind: "bad_image", title: "This photo can't be used", message: reason, actions: ["retake", "library", "manual"] };
  }
  if (status === 503) {
    return {
      kind: "ocr_unavailable",
      title: "Scanning is unavailable right now",
      message: `${extractErrorMessage(error)} Your receipt wasn't saved anywhere.`,
      actions: ["manual"],
    };
  }
  if (status === 429) {
    return {
      kind: "rate_limited",
      title: "Too many scans",
      message: "You've scanned a lot of receipts in the last hour. Try again later, or add this one manually.",
      actions: ["manual"],
    };
  }
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
    return {
      kind: "timeout",
      title: "Reading the receipt took too long",
      message: "Try again with a sharper photo, or add the transaction manually.",
      actions: ["retake", "manual"],
    };
  }
  if (isOfflineError(error)) {
    return {
      kind: "offline",
      title: "No connection",
      message: "Scanning happens on the server. Add the transaction manually — it syncs when you're back online.",
      actions: ["manual"],
    };
  }
  return { kind: "unknown", title: "Something went wrong", message: extractErrorMessage(error), actions: ["retake", "manual"] };
}

/** A successful scan that still can't be reviewed as a receipt; null when it can. */
export function problemFromScan(scan: ReceiptScan): ScanProblem | null {
  if (scan.outcome === "unreadable") {
    return {
      kind: "unreadable",
      title: "We couldn't read this photo",
      message: `No text was found on it. ${PHOTO_TIPS}`,
      actions: ["retake", "library", "manual"],
    };
  }
  if (scan.outcome === "unsupported") {
    return {
      kind: "unsupported",
      title: "This doesn't look like a receipt",
      message: "We found text, but no total and no date. Spendly reads printed shop receipts.",
      actions: ["retake", "review", "manual"],
    };
  }
  return null;
}

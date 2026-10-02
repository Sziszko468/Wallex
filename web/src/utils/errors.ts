import axios, { type AxiosError } from "axios";
import { t } from "i18next";
import { HTTP_STATUS } from "../config/http";
import type { ApiErrorBody } from "../types/api";

export type FieldErrors = Record<string, string>;

function getErrorBody(error: unknown): ApiErrorBody | null {
  if (!axios.isAxiosError(error)) return null;
  const data: unknown = (error as AxiosError<ApiErrorBody>).response?.data;
  // DRF errors are JSON objects; an HTML error page (500 in DEBUG, a proxy's
  // 502) arrives as a string and must not be parsed as field errors.
  return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as ApiErrorBody) : null;
}

export function extractFieldErrors(error: unknown): FieldErrors {
  const body = getErrorBody(error);
  if (!body) return {};

  const fieldErrors: FieldErrors = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "detail" || key === "non_field_errors") continue;
    if (Array.isArray(value) && typeof value[0] === "string") {
      fieldErrors[key] = value[0];
    } else if (typeof value === "string") {
      fieldErrors[key] = value;
    }
  }
  return fieldErrors;
}

export function extractErrorMessage(error: unknown): string {
  const body = getErrorBody(error);
  if (!body) {
    if (axios.isAxiosError(error) && !error.response) {
      return t("errors.network");
    }
    return t("errors.generic");
  }

  if (typeof body.detail === "string") return body.detail;

  const nonFieldErrors = body.non_field_errors;
  if (Array.isArray(nonFieldErrors) && typeof nonFieldErrors[0] === "string") {
    return nonFieldErrors[0];
  }

  const fieldErrors = extractFieldErrors(error);
  const firstField = Object.keys(fieldErrors)[0];
  if (firstField) return fieldErrors[firstField]!;

  return t("errors.generic");
}

function statusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** The object no longer exists — typically deleted on another device. */
export function isNotFound(error: unknown): boolean {
  return statusOf(error) === HTTP_STATUS.NOT_FOUND;
}

/** 412: the object was changed on another device after it was loaded; nothing was saved. */
export function isConflict(error: unknown): boolean {
  return statusOf(error) === HTTP_STATUS.PRECONDITION_FAILED;
}

/** The object as it is now on the server, sent along with a 412. */
export function conflictCurrent<T>(error: unknown): T | null {
  if (!isConflict(error)) return null;
  const current = (getErrorBody(error) as { current?: unknown } | null)?.current;
  return typeof current === "object" && current !== null ? (current as T) : null;
}

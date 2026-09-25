import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { extractErrorMessage, extractFieldErrors } from "./errors";

function apiError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    headers: {},
    config,
    data,
  });
}

describe("DRF error parsing", () => {
  it("maps field errors to their fields for inline display", () => {
    const error = apiError(400, { amount: ["Must be positive."], category: ["Invalid pk."] });

    expect(extractFieldErrors(error)).toEqual({ amount: "Must be positive.", category: "Invalid pk." });
  });

  it("prefers detail, then non_field_errors, then the first field error for the banner", () => {
    expect(extractErrorMessage(apiError(404, { detail: "Not found." }))).toBe("Not found.");
    expect(extractErrorMessage(apiError(400, { non_field_errors: ["Passwords do not match."] }))).toBe(
      "Passwords do not match."
    );
    expect(extractErrorMessage(apiError(400, { email: ["Already registered."] }))).toBe("Already registered.");
  });

  it("explains a network failure instead of a generic error", () => {
    const offline = new AxiosError("Network Error", "ERR_NETWORK");

    expect(extractErrorMessage(offline)).toMatch(/network/i);
  });

  it("never throws on unexpected shapes", () => {
    expect(extractErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
    expect(extractErrorMessage(apiError(500, "<html>Server Error</html>"))).toBe("Something went wrong. Please try again.");
    expect(extractFieldErrors("nonsense")).toEqual({});
  });
});

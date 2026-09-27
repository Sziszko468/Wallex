import { problemFromError, problemFromScan } from "../../utils/receiptProblems";
import type { ReceiptScan } from "../../types/receipt";

function httpError(status: number, data: unknown = {}) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

function noResponse(code?: string) {
  return Object.assign(new Error("Network Error"), { isAxiosError: true, code });
}

const scan: ReceiptScan = {
  merchant: { value: null, confidence: "low" },
  amount: { value: null, confidence: "low" },
  date: { value: null, confidence: "low" },
  currency: { value: null, confidence: "low" },
  unsupported_currency: null,
  items: [],
  category: null,
  text_found: true,
  outcome: "incomplete",
};

describe("problemFromError", () => {
  it("a photo the server rejects: its reason, and ways to try another one", () => {
    const problem = problemFromError(httpError(400, { image: ["The file is not a readable image."] }));

    expect(problem).toEqual({
      kind: "bad_image",
      title: "This photo can't be used",
      message: "The file is not a readable image.",
      actions: ["retake", "library", "manual"],
    });
  });

  it("a photo that is too large", () => {
    const problem = problemFromError(httpError(413, { image: ["The photo is too large (max 10 MB)."] }));

    expect([problem.kind, problem.message]).toEqual(["bad_image", "The photo is too large (max 10 MB)."]);
  });

  it("the OCR engine is down: only manual entry makes sense", () => {
    const problem = problemFromError(
      httpError(503, { detail: "Receipt scanning is temporarily unavailable. Please add the transaction manually." })
    );

    expect(problem.kind).toBe("ocr_unavailable");
    expect(problem.message).toMatch(/temporarily unavailable.*wasn't saved anywhere/);
    expect(problem.actions).toEqual(["manual"]);
  });

  it("too many scans", () => {
    expect(problemFromError(httpError(429, { detail: "Request was throttled." }))).toMatchObject({
      kind: "rate_limited",
      actions: ["manual"],
    });
  });

  it("a timeout", () => {
    expect(problemFromError(noResponse("ECONNABORTED"))).toMatchObject({ kind: "timeout", actions: ["retake", "manual"] });
  });

  it("no connection", () => {
    expect(problemFromError(noResponse())).toMatchObject({ kind: "offline", actions: ["manual"] });
  });

  it("anything else", () => {
    expect(problemFromError(new Error("boom"))).toMatchObject({ kind: "unknown", actions: ["retake", "manual"] });
  });
});

describe("problemFromScan", () => {
  it("no text on the photo", () => {
    expect(problemFromScan({ ...scan, text_found: false, outcome: "unreadable" })).toMatchObject({
      kind: "unreadable",
      actions: ["retake", "library", "manual"],
    });
  });

  it("text, but not a receipt: the user may still type the details in", () => {
    expect(problemFromScan({ ...scan, outcome: "unsupported" })).toMatchObject({
      kind: "unsupported",
      actions: ["retake", "review", "manual"],
    });
  });

  it.each(["complete", "incomplete"] as const)("a %s scan goes straight to review", (outcome) => {
    expect(problemFromScan({ ...scan, outcome })).toBeNull();
  });
});

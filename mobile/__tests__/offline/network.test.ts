import { isOfflineError } from "../../utils/network";

function httpError(status: number, data: unknown) {
  return Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status, data } });
}

describe("isOfflineError", () => {
  it("no answer at all is offline", () => {
    expect(isOfflineError(Object.assign(new Error("Network Error"), { isAxiosError: true }))).toBe(true);
  });

  it.each([502, 503, 504])("a proxy's %i (backend down) is offline", (status) => {
    expect(isOfflineError(httpError(status, "<html>Bad Gateway</html>"))).toBe(true);
  });

  it("a 503 Django wrote itself is one feature being down, not the backend", () => {
    const assistantDown = httpError(503, { detail: "The assistant is temporarily unavailable.", code: "assistant_unavailable" });
    expect(isOfflineError(assistantDown)).toBe(false);
  });

  it("other errors are not offline", () => {
    expect(isOfflineError(httpError(400, { message: ["This field is required."] }))).toBe(false);
    expect(isOfflineError(new Error("not axios"))).toBe(false);
  });
});

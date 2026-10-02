import { AxiosError, AxiosHeaders } from "axios";
import appConfig from "../../app.json";
import { resolveApiBaseUrl } from "../../utils/apiBaseUrl";
import { describeError } from "../../utils/logging";

describe("mobile security configuration", () => {
  it("keeps app data out of Android backups (cached financial data, offline queue)", () => {
    expect(appConfig.expo.android.allowBackup).toBe(false);
  });

  it("only public, non-secret values are baked into the bundle via EXPO_PUBLIC_*", () => {
    const publicVars = Object.keys(process.env).filter((name) => name.startsWith("EXPO_PUBLIC_"));
    expect(publicVars.filter((name) => /SECRET|TOKEN|PASSWORD|KEY/i.test(name))).toEqual([]);
  });
});

describe("API base URL", () => {
  it("development may use plain http to reach the local backend", () => {
    expect(resolveApiBaseUrl({ isDev: true, explicit: undefined, hostUri: "192.168.1.20:8081" })).toBe(
      "http://192.168.1.20:8000/api"
    );
  });

  it("a release build refuses a non-https API URL (tokens would travel in cleartext)", () => {
    expect(() => resolveApiBaseUrl({ isDev: false, explicit: "http://api.wallex.example/api", hostUri: undefined })).toThrow(
      /https/
    );
    expect(() => resolveApiBaseUrl({ isDev: false, explicit: undefined, hostUri: undefined })).toThrow(/https/);
  });

  it("a release build accepts an https API URL", () => {
    expect(resolveApiBaseUrl({ isDev: false, explicit: "https://api.wallex.example/api", hostUri: undefined })).toBe(
      "https://api.wallex.example/api"
    );
  });
});

describe("log sanitization", () => {
  it("never writes tokens or request bodies to the device log", () => {
    const config = {
      headers: new AxiosHeaders({ Authorization: "Bearer secret-access-token" }),
      url: "/auth/logout/",
      data: JSON.stringify({ refresh: "secret-refresh-token" }),
    };
    const error = new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", config, null, {
      status: 400,
      statusText: "",
      headers: {},
      config,
      data: { detail: "secret-refresh-token is invalid" },
    });

    const logged = describeError(error);

    expect(logged).not.toMatch(/secret-access-token|secret-refresh-token/);
    expect(logged).toContain("400");
  });

  it("keeps enough detail to debug non-HTTP errors", () => {
    expect(describeError(new TypeError("boom"))).toBe("TypeError: boom");
    expect(describeError("plain string")).toBe("plain string");
  });
});

import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp";

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name!, values];
    })
  );
}

describe("Content-Security-Policy", () => {
  const policy = directives(buildContentSecurityPolicy("https://api.spendly.example/api"));

  it("only runs the app's own scripts — no inline or eval'd code", () => {
    expect(policy["script-src"]).toEqual(["'self'"]);
    expect(policy["default-src"]).toEqual(["'self'"]);
  });

  it("lets the page talk only to itself and the API origin (tokens can't be sent elsewhere)", () => {
    expect(policy["connect-src"]).toEqual(["'self'", "https://api.spendly.example"]);
  });

  it("allows only the page's own origin when the API is same-origin (relative base URL)", () => {
    const sameOrigin = directives(buildContentSecurityPolicy("/api"));
    expect(sameOrigin["connect-src"]).toEqual(["'self'"]);
  });

  it("blocks plugins and <base>/<form> hijacking", () => {
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
  });
});

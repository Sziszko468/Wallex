import { defineConfig } from "@playwright/test";

/**
 * Browser tests of the running stack (web app + API + database); start it first:
 *   docker compose up -d   and   npm --prefix web run dev
 * Chrome is used as it is installed (no browser download); CI's runners have it.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One at a time: every test creates and erases its own account in the shared dev database.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:5173",
    channel: "chrome",
    locale: "en-GB",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

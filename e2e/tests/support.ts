import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.API_URL ?? "http://localhost:8000/api";
export const PASSWORD = "E2e-Passw0rd!2026-xyz";

let counter = 0;

/** An address no other test (or earlier run) used. */
export function uniqueEmail(): string {
  counter += 1;
  return `e2e-${Date.now()}-${counter}@example.com`;
}

/** Registers through the form; the app signs the new person in and lands on the dashboard. */
export async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("First name").fill("Eszter");
  await page.getByLabel("Last name").fill("Teszt");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Erases the account through the API, so a test that leaves one behind doesn't litter the database. */
export async function eraseAccount(request: APIRequestContext, email: string): Promise<void> {
  const login = await request.post(`${API}/auth/login/`, { data: { email, password: PASSWORD } });
  if (!login.ok()) return; // already deleted by the test itself
  const { access } = await login.json();
  await request.post(`${API}/auth/delete-account/`, {
    data: { password: PASSWORD },
    headers: { Authorization: `Bearer ${access}` },
  });
}

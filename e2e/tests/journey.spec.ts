import { expect, test } from "@playwright/test";
import { eraseAccount, PASSWORD, signUp, uniqueEmail } from "./support";

let email: string;

test.beforeEach(() => {
  email = uniqueEmail();
});

test.afterEach(async ({ request }) => {
  await eraseAccount(request, email);
});

test("a new person signs up, records a transaction and sees it", async ({ page }) => {
  await signUp(page, email);
  await expect(page.getByRole("heading", { name: /Eszter/ })).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).first().click();
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("42.10");
  await dialog.getByLabel("Category").selectOption({ label: "Food" });
  await dialog.getByLabel("Description (optional)").fill("E2E lunch");
  await dialog.getByRole("button", { name: "Add transaction" }).click();

  await expect(page.getByText("E2E lunch")).toBeVisible();
  await expect(page.getByText(/42[.,]10/).first()).toBeVisible();
});

test("the app speaks Hungarian after switching, default categories included, and remembers it", async ({ page }) => {
  await signUp(page, email);

  await page.goto("/settings");
  await page.getByRole("radio", { name: "Magyar" }).first().click();
  await expect(page.getByRole("heading", { name: "Beállítások" })).toBeVisible();

  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tranzakció hozzáadása" }).first().click();
  const categories = page.getByRole("dialog").getByLabel("Kategória");
  await expect(categories.locator("option", { hasText: "Élelmiszer" })).toHaveCount(1);
  await expect(categories.locator("option", { hasText: "Lakhatás" })).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tranzakciók" })).toBeVisible(); // still Hungarian after a reload
});

test("an account is erased from the Security page, and cannot sign in again", async ({ page }) => {
  await signUp(page, email);

  await page.goto("/settings/security");
  const card = page.getByRole("heading", { name: "Your data" }).locator("..");
  await card.getByRole("button", { name: "Delete my account" }).click();
  await card.getByLabel("Password").fill("not the password");
  await card.getByRole("button", { name: "Delete my account forever" }).click();
  await expect(card.getByText("Wrong password.")).toBeVisible(); // nothing erased by a wrong password

  await card.getByLabel("Password").fill(PASSWORD);
  await card.getByRole("button", { name: "Delete my account forever" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login/); // refused
});

test("the data download holds the transactions and no secrets", async ({ page }) => {
  await signUp(page, email);
  const download = page.waitForEvent("download");
  const exported = page.waitForResponse("**/auth/export/");

  await page.goto("/settings/security");
  const card = page.getByRole("heading", { name: "Your data" }).locator("..");
  await card.getByRole("button", { name: "Download my data" }).click();
  await card.getByLabel("Password").fill(PASSWORD);
  await card.getByRole("button", { name: "Download", exact: true }).click();

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^wallex-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = await (await exported).json();
  expect(data.account.email).toBe(email);
  expect(data.categories.length).toBeGreaterThanOrEqual(10); // the ten defaults
  expect(JSON.stringify(data)).not.toContain("pbkdf2");
});

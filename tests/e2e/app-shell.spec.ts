import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

test("public app shell links into sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Today needs attention" })
  ).toBeVisible();
  await page.getByRole("link", { name: /Sign in to use real household data/ }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open your coverage board" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

test("login shell has no critical accessibility violations", async ({ page }) => {
  await page.goto("/login");

  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("login sent and expired-link states give clear recovery guidance", async ({ page }) => {
  await page.goto("/login?sent=1&email=parent%40example.com");

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Open the newest FamTandem email");
  await expect(page.getByLabel("Email")).toHaveValue("parent@example.com");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();

  await page.goto("/login?error=auth_link_failed&email=parent%40example.com");

  await expect(
    page.getByRole("alert").filter({ hasText: "That email link could not be used" })
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("parent@example.com");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

test("signed-in device session reopens the app until explicit sign out", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for authenticated session persistence coverage."
  );

  const runId = `${testInfo.project.name}-${randomUUID()}`;
  const email = `session-persistence-${runId}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });
  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill(`Session Family ${runId}`);
    await page.getByLabel("Your name").fill("Krish");
    await page.getByLabel(/I understand and agree/).check();
    await page.getByRole("button", { name: "Create household" }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  await expect(page.getByRole("heading", { name: "Today needs attention" })).toBeVisible({
    timeout: 30_000
  });

  await page.goto("/login");
  await page.waitForURL(/\/app/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Today needs attention" })).toBeVisible();

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Today needs attention" })).toBeVisible();

  const reopened = await page.context().newPage();
  await reopened.goto("/app");
  await expect(reopened.getByRole("heading", { name: "Today needs attention" })).toBeVisible();
  await reopened.close();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/\/login\?signedOut=1/, { timeout: 15_000 });
  await expect(page.getByRole("status")).toContainText("You're signed out on this device.");

  await page.goto("/app");
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

async function getMagicLink(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let message: MailpitMessages["messages"][number] | undefined;

    try {
      const mailbox = await fetch("http://127.0.0.1:54324/api/v1/messages").then(
        (response) => response.json() as Promise<MailpitMessages>
      );
      message = mailbox.messages.find((candidate) =>
        candidate.To.some((recipient) => recipient.Address === email)
      );

      if (message) {
        const detail = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`).then(
          (response) => response.json() as Promise<{ Text: string }>
        );
        const match = detail.Text.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)]+/);
        if (match) return match[0];
      }
    } catch {
      // Mailpit can briefly reject connections while local Supabase services settle.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No local magic-link email found for ${email}`);
}

type MailpitMessages = {
  messages: {
    ID: string;
    To: { Address: string }[];
  }[];
};

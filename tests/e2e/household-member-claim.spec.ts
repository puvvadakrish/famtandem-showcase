import { expect, type Page, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

test("invited household member claims existing member row by email", async ({
  browser,
  page
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for household member claim smoke coverage."
  );

  const runId = `${testInfo.project.name}-${randomUUID()}`;
  const adminEmail = `member-claim-admin-${runId}@example.com`;
  const invitedEmail = `member-claim-invited-${runId}@example.com`;
  const householdName = `Member claim family ${runId}`;

  await requestMagicLink(page, adminEmail);
  await page.goto(await getMagicLink(adminEmail));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill(householdName);
    await page.getByLabel("Your name").fill("Krish");
    await page.getByLabel(/I understand and agree/).check();
    await page.getByRole("button", { name: "Create household" }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  const setup = page.locator("#household-setup");
  await setup.scrollIntoViewIfNeeded();
  await setup.getByPlaceholder("Display name").fill("Maya Parent");
  await setup.locator('select[name="role"]').selectOption("parent");
  await setup.getByPlaceholder("Email").fill(invitedEmail);
  await setup.getByRole("button", { name: "Add and send invite" }).click();
  await expect(setup.getByText("Invite sent to Maya Parent")).toBeVisible({ timeout: 30_000 });
  await expect(setup.getByText("Invite pending")).toBeVisible();
  await expect(setup.getByText(invitedEmail)).toBeVisible();

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: pendingMember, error: pendingError } = await serviceSupabase
    .from("household_members")
    .select("id, household_id, user_id, email")
    .eq("email", invitedEmail)
    .single<{ id: string; household_id: string; user_id: string | null; email: string }>();
  expect(pendingError).toBeNull();
  expect(pendingMember?.user_id).toBeNull();

  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  await requestMagicLink(invitedPage, invitedEmail);
  await invitedPage.goto(await getMagicLink(invitedEmail));
  await invitedPage.waitForURL(/\/app/, { timeout: 15_000 });
  await expect(invitedPage).not.toHaveURL(/\/household\/new/);
  await expect(invitedPage.getByRole("heading", { name: "Today needs attention" })).toBeVisible();
  await expect(invitedPage.getByText("Maya Parent")).toBeVisible();
  await expect(invitedPage.getByRole("heading", { name: "Add logistics" })).toHaveCount(0);
  await invitedContext.close();

  const { data: claimedMembers, error: claimedError } = await serviceSupabase
    .from("household_members")
    .select("id, household_id, user_id, email")
    .eq("email", invitedEmail)
    .returns<{ id: string; household_id: string; user_id: string | null; email: string }[]>();
  expect(claimedError).toBeNull();
  expect(claimedMembers).toHaveLength(1);
  expect(claimedMembers?.[0]?.id).toBe(pendingMember!.id);
  expect(claimedMembers?.[0]?.household_id).toBe(pendingMember!.household_id);
  expect(claimedMembers?.[0]?.user_id).not.toBeNull();
});

async function requestMagicLink(page: Page, email: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`/login?email=${encodeURIComponent(email)}`);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();

    try {
      await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });
      return;
    } catch (error) {
      if (!page.url().includes("error=signin_failed") && !page.url().includes("error=rate_limited")) {
        throw error;
      }
      await page.waitForTimeout(3_000);
    }
  }

  throw new Error(`Could not request local magic link for ${email}`);
}

async function getMagicLink(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const mailbox = await fetch("http://127.0.0.1:54324/api/v1/messages").then(
      (response) => response.json() as Promise<MailpitMessages>
    );
    const message = mailbox.messages.find((candidate) =>
      candidate.To.some((recipient) => recipient.Address === email)
    );

    if (message) {
      const detail = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`).then(
        (response) => response.json() as Promise<{ Text: string }>
      );
      const match = detail.Text.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)]+/);
      if (match) return match[0];
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

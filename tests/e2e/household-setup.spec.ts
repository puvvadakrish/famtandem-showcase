import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("household setup makes saving children explicit and persistent", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for household setup smoke coverage."
  );

  const runId = `${testInfo.project.name}-${randomUUID()}`;
  const adminEmail = `household-setup-admin-${runId}@example.com`;
  const helperEmail = `household-setup-helper-${runId}@example.com`;
  const householdName = `Household setup family ${runId}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });
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
  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("link", { name: "People" }).click();
  } else {
    await setup.scrollIntoViewIfNeeded();
  }

  await expect(setup.getByRole("heading", { name: "Children saved" })).toBeVisible();
  await expect(setup.getByText("No children saved yet. Add one child below, save, then repeat for each child.")).toBeVisible();
  await expect(setup.getByRole("heading", { name: "Save a child profile" })).toBeVisible();
  await expect(setup.getByRole("button", { name: "Save child" })).toBeVisible();

  const childForm = setup.locator("form").filter({ hasText: "Save a child profile" });
  await childForm.getByPlaceholder("Child name").fill("Avery");
  await childForm.getByPlaceholder("Age, grade, or group").fill("3rd grade");
  await childForm.getByRole("button", { name: "Save child" }).click();

  await expect(setup.getByText("Avery · 3rd grade")).toBeVisible({ timeout: 30_000 });
  await expect(setup.getByText("Avery saved")).toBeVisible();
  await expect(setup.getByText("The child list is updated. Add another child when you are ready.")).toBeVisible();
  await expect(setup.getByText("Add another child", { exact: true })).toBeVisible();
  await expect(setup.getByText("Saved", { exact: true })).toBeVisible();
  await expect(setup.getByText("No children saved yet. Add one child below, save, then repeat for each child.")).toHaveCount(0);

  await page.reload();
  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("link", { name: "People" }).click();
  } else {
    await setup.scrollIntoViewIfNeeded();
  }
  await expect(setup.getByText("Avery · 3rd grade")).toBeVisible();
  await expect(setup.getByText("Add another child", { exact: true })).toBeVisible();

  const cardTitle = `Weekly piano ${runId}`;
  const newCard = page.locator("#new-card");
  await newCard.scrollIntoViewIfNeeded();
  await newCard.getByLabel("Card title").fill(cardTitle);
  await newCard.getByLabel("Child").selectOption({ label: "Avery" });
  await newCard.getByLabel("Time").fill("2026-07-07T16:30");
  await newCard.getByLabel("Location").fill("Music studio");
  await newCard.getByLabel("Frequency").selectOption("weekly");
  await newCard.getByLabel("Create").selectOption("4");
  await newCard.getByRole("button", { name: "Create card" }).click();

  await expect(page.getByText("Created 4 events from this repeat.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Need another similar plan? Use this form again to create another card or another short repeat.")).toBeVisible();
  await expect(page.getByText(cardTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(`${cardTitle} (2 of 4)`)).toBeVisible();
  await expect(page.getByText(`${cardTitle} (4 of 4)`)).toBeVisible();

  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("link", { name: "People" }).click();
  } else {
    await setup.scrollIntoViewIfNeeded();
  }

  const memberForm = setup.locator("form").filter({ hasText: "Add adult or helper" });
  await memberForm.getByPlaceholder("Display name").fill("Maya Helper");
  await memberForm.getByPlaceholder("Email").fill(helperEmail);
  await memberForm.getByRole("button", { name: "Add and send invite" }).click();

  await expect(setup.getByText("Invite sent to Maya Helper")).toBeVisible({ timeout: 30_000 });
  await expect(setup.getByText("Maya Helper · helper")).toBeVisible();
  await expect(setup.getByText(helperEmail)).toBeVisible();
  await expect(setup.getByText("Invite pending")).toBeVisible();
  await expect(setup.getByRole("button", { name: "Send invite" })).toBeVisible();
  await expect(setup.getByRole("link", { name: "Open sign-in" })).toHaveAttribute(
    "href",
    `/login?email=${encodeURIComponent(helperEmail)}`
  );
  await expect(setup.getByText(/If delivery fails, the person can still open the/)).toBeVisible();

  await page.goto(await getMagicLink(helperEmail));
  await page.waitForURL(/\/app/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Today needs attention" })).toBeVisible({ timeout: 30_000 });

  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("link", { name: "People" }).click();
  } else {
    await setup.scrollIntoViewIfNeeded();
  }
  await expect(setup.getByText("Maya Helper · helper")).toBeVisible();
  await expect(setup.getByText("Invite pending")).toHaveCount(0);
  await expect(setup.getByText(helperEmail)).toHaveCount(0);
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

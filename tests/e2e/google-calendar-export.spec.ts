import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

test("Google Calendar export stays hidden and offline by default", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for authenticated Google Calendar export smoke coverage."
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const email = `calendar-e2e-${testInfo.project.name}-${randomUUID()}@example.com`;
  const cardTitle = `Calendar-safe soccer pickup ${testInfo.project.name} ${randomUUID()}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });

  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill("Calendar E2E family");
    await page.getByLabel("Your name").fill("Krish");
    await page.getByLabel(/I understand and agree/).check();
    await page.getByRole("button", { name: "Create household" }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("id, household_id")
    .eq("email", email)
    .single<{ id: string; household_id: string }>();
  expect(memberError).toBeNull();

  const { data: card, error: cardError } = await supabase
    .from("coverage_cards")
    .insert({
      household_id: member!.household_id,
      card_type: "event",
      title: cardTitle,
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      location: "North field",
      source_summary: "Coach email",
      computed_coverage_state: "needs_coverage",
      attention_flags: ["needs_coverage"],
      created_by: member!.id,
      manually_edited: true
    })
    .select("id")
    .single<{ id: string }>();
  expect(cardError).toBeNull();

  const { error: slotError } = await supabase.from("coverage_slots").insert({
    card_id: card!.id,
    kind: "pickup",
    state: "needs_coverage"
  });
  expect(slotError).toBeNull();

  await page.goto("/app");
  const cardArticle = page.locator("article", { hasText: cardTitle });
  await expect(cardArticle).toBeVisible();
  await expect(cardArticle.getByRole("link", { name: "Ask for coverage" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Google Calendar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to Google Calendar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Update Google Calendar" })).toHaveCount(0);
});

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

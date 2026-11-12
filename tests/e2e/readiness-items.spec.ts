import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

test("household admin can mark source-backed readiness done and it persists after reload", async ({
  page
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for authenticated readiness smoke coverage."
  );

  const email = `readiness-e2e-${testInfo.project.name}-${randomUUID()}@example.com`;
  const cardTitle = `Readiness persistence ${testInfo.project.name} ${randomUUID()}`;
  const readinessLabel = "Sign permission slip and pack cleats";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });

  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill("Readiness E2E family");
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

  const { data: source, error: sourceError } = await supabase
    .from("source_inputs")
    .insert({
      household_id: member!.household_id,
      submitted_by: member!.id,
      source_type: "paste",
      raw_subject: "Readiness persistence source",
      normalized_text: "Coach note: pickup is covered, but sign the permission slip and pack cleats.",
      status: "processed"
    })
    .select("id")
    .single<{ id: string }>();
  expect(sourceError).toBeNull();

  const { data: card, error: cardError } = await supabase
    .from("coverage_cards")
    .insert({
      household_id: member!.household_id,
      source_input_id: source!.id,
      card_type: "event",
      title: cardTitle,
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      location: "North field",
      source_summary: "Coach note",
      confidence: 0.95,
      computed_coverage_state: "due_soon",
      attention_flags: ["due_soon"],
      created_by: member!.id
    })
    .select("id")
    .single<{ id: string }>();
  expect(cardError).toBeNull();

  const { error: slotError } = await supabase.from("coverage_slots").insert({
    card_id: card!.id,
    kind: "pickup",
    state: "accepted",
    owner_member_id: member!.id
  });
  expect(slotError).toBeNull();

  const { data: readiness, error: readinessError } = await supabase
    .from("readiness_items")
    .insert({
      card_id: card!.id,
      label: readinessLabel,
      status: "open",
      due_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    })
    .select("id")
    .single<{ id: string }>();
  expect(readinessError).toBeNull();

  await page.goto("/app");
  const cardArticle = page.locator("article", { hasText: cardTitle });
  await expect(cardArticle).toBeVisible();
  await expect(cardArticle.getByText("Due soon").first()).toBeVisible();
  await expect(cardArticle.getByLabel("Readiness status")).toHaveValue("open");

  await cardArticle.getByLabel("Readiness status").selectOption("done");
  await cardArticle.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () => {
      const { data } = await supabase
        .from("readiness_items")
        .select("status")
        .eq("id", readiness!.id)
        .single<{ status: string }>();
      return data?.status;
    }, { timeout: 15_000 })
    .toBe("done");

  await page.reload();
  const reloadedCard = page.locator("article", { hasText: cardTitle });
  await expect(reloadedCard).toBeVisible();
  await expect(reloadedCard.getByLabel("Readiness status")).toHaveValue("done");
  await expect(reloadedCard.getByText("Covered").first()).toBeVisible();
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

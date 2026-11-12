import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("internal admin can view validation snapshot and non-admin cannot", async ({
  page
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for internal admin validation smoke coverage."
  );

  const email = `validation-admin-${testInfo.project.name}-${randomUUID()}@example.com`;
  const householdName = `Validation E2E family ${testInfo.project.name} ${randomUUID()}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });

  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill(householdName);
    await page.getByLabel("Your name").fill("Krish");
    await page.getByLabel(/I understand and agree/).check();
    await page.getByRole("button", { name: "Create household" }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: user, error: userError } = await supabase
    .from("household_members")
    .select("id, household_id, user_id, households!inner(name)")
    .eq("display_name", "Krish")
    .eq("households.name", householdName)
    .single<{ id: string; household_id: string; user_id: string; households: { name: string } }>();
  expect(userError).toBeNull();

  const { error: internalAdminError } = await supabase
    .from("internal_admins")
    .insert({ user_id: user!.user_id });
  expect(internalAdminError).toBeNull();

  const { data: source, error: sourceError } = await supabase
    .from("source_inputs")
    .insert({
      household_id: user!.household_id,
      submitted_by: user!.id,
      source_type: "paste",
      raw_subject: "Validation source",
      normalized_text: "Pickup is Friday at 5 PM.",
      status: "processed"
    })
    .select("id")
    .single<{ id: string }>();
  expect(sourceError).toBeNull();

  const { data: card, error: cardError } = await supabase
    .from("coverage_cards")
    .insert({
      household_id: user!.household_id,
      source_input_id: source!.id,
      card_type: "event",
      title: "Validation pickup",
      source_summary: "Pickup is Friday at 5 PM.",
      computed_coverage_state: "needs_coverage",
      attention_flags: ["needs_coverage"],
      created_by: user!.id,
      manually_edited: true
    })
    .select("id")
    .single<{ id: string }>();
  expect(cardError).toBeNull();

  const { data: slot, error: slotError } = await supabase
    .from("coverage_slots")
    .insert({
      card_id: card!.id,
      kind: "pickup",
      state: "needs_coverage"
    })
    .select("id")
    .single<{ id: string }>();
  expect(slotError).toBeNull();

  const { data: requestToken, error: requestTokenError } = await supabase
    .from("coverage_request_tokens")
    .insert({
      household_id: user!.household_id,
      card_id: card!.id,
      token_hash: `validation-e2e-token-hash-${randomUUID()}-${randomUUID()}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: user!.id
    })
    .select("id")
    .single<{ id: string }>();
  expect(requestTokenError).toBeNull();

  const { data: requestRow, error: requestError } = await supabase
    .from("coverage_requests")
    .insert({
      slot_id: slot!.id,
      requested_by: user!.id,
      request_token_id: requestToken!.id,
      channel: "manual_link",
      status: "accepted"
    })
    .select("id")
    .single<{ id: string }>();
  expect(requestError).toBeNull();

  const { error: responseError } = await supabase
    .from("coverage_responses")
    .insert({ request_id: requestRow!.id, response: "accept_pickup" });
  expect(responseError).toBeNull();

  await page.goto("/app/admin/validation");
  await expect(page.getByRole("heading", { name: "Validation snapshot" })).toBeVisible();
  await expect(page.getByText(householdName)).toBeVisible();
  await expect(page.getByText("Source inputs")).toBeVisible();
  await expect(page.getByText("Accepted responses")).toBeVisible();
  await expect(page.getByRole("link", { name: "Operations" })).toBeVisible();
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth + 1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^famtandem-validation-snapshot-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await download.createReadStream().then(
    async (stream) =>
      new Promise<string>((resolve, reject) => {
        let body = "";
        stream.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        stream.on("end", () => resolve(body));
        stream.on("error", reject);
      })
  );
  expect(csv).toContain("totals,coverage_requests,");
  expect(csv).toContain(householdName);
  expect(csv).toContain(`,${householdName},1,1,1,1`);
  expect(csv).not.toContain("validation-e2e-token-hash");
  expect(csv).not.toContain("Pickup is Friday at 5 PM.");

  const { error: failedJobError } = await supabase.from("jobs").insert({
    kind: "extract_source",
    payload: {
      source_input_id: source!.id,
      token_hash: requestToken!.id,
      storage_path: `${user!.household_id}/${source!.id}/private.pdf`
    },
    status: "failed",
    last_error: `Gemini timeout for ${user!.household_id}/${source!.id}/private.pdf`
  });
  expect(failedJobError).toBeNull();

  const { error: artifactError } = await supabase.from("source_artifacts").insert({
    source_input_id: source!.id,
    household_id: user!.household_id,
    storage_path: `${user!.household_id}/${source!.id}/private.pdf`,
    original_file_name: "private.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 128,
    text_extraction_status: "failed",
    text_extraction_error: `Unable to read ${user!.household_id}/${source!.id}/private.pdf`,
    created_by: user!.id
  });
  expect(artifactError).toBeNull();

  const { error: extractionRunError } = await supabase
    .from("extraction_runs")
    .update({
      status: "failed",
      provider: "gemini",
      last_error: "schema parse failed for Pickup is Friday at 5 PM."
    })
    .eq("source_input_id", source!.id);
  expect(extractionRunError).toBeNull();

  const { error: notificationRunError } = await supabase.from("notification_runs").insert({
    household_id: user!.household_id,
    recipient_member_id: user!.id,
    notification_type: "daily_unresolved",
    local_date: "2026-05-26",
    status: "failed",
    provider: "resend",
    last_error: "Notification provider send failed."
  });
  expect(notificationRunError).toBeNull();

  const { error: sendEventError } = await supabase.from("card_events").insert({
    household_id: user!.household_id,
    card_id: card!.id,
    actor_member_id: user!.id,
    event_type: "coverage_request_send_failed",
    metadata: {
      provider: "resend",
      status: "failed",
      requestTokenId: requestToken!.id,
      tokenHash: "validation-e2e-token-hash-private"
    }
  });
  expect(sendEventError).toBeNull();

  await page.goto("/app/admin/ops");
  await expect(page.getByRole("heading", { name: "Operations snapshot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job Health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Extraction Runs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upload Text/OCR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notification Runs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coverage Request Sends" })).toBeVisible();
  await expect(page.getByText("provider failure")).not.toHaveCount(0);
  await expect(page.getByText("parse or schema")).not.toHaveCount(0);
  await expect(page.getByText("validation-e2e-token-hash-private")).toHaveCount(0);
  await expect(page.getByText("private.pdf")).toHaveCount(0);
  await expect(page.getByText("Pickup is Friday at 5 PM.")).toHaveCount(0);

  const { error: deactivateAdminError } = await supabase
    .from("internal_admins")
    .update({ active: false })
    .eq("user_id", user!.user_id);
  expect(deactivateAdminError).toBeNull();

  await page.goto("/app/admin/validation");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

  await page.goto("/app/admin/ops");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

  const exportResponse = await page.goto("/app/admin/validation/export");
  expect(exportResponse?.status()).toBe(404);
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

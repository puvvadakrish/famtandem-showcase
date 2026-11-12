import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("household admin can process a pasted logistics source immediately", async ({
  page
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for authenticated paste intake smoke coverage."
  );

  const email = `paste-e2e-${testInfo.project.name}-${randomUUID()}@example.com`;
  const sourceTitle = `Coach update paste E2E ${testInfo.project.name} ${randomUUID()}`;
  const pastedText =
    "Coach update: Maya soccer pickup moved to the north field on Friday at 5:30 PM. Please bring cleats and a water bottle.";

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });

  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill("Paste E2E family");
    await page.getByLabel("Your name").fill("Krish");
    const timezoneField = page.getByLabel("Timezone");
    await expect(timezoneField).toBeVisible();
    await expect(timezoneField).not.toHaveValue("");
    await timezoneField.fill("America/Chicago");
    await page.getByLabel(/I understand and agree/).check();
    await page.getByRole("button", { name: "Create household" }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  await expect(page.getByRole("heading", { name: "Start with this week's real logistics" })).toBeVisible();
  await expect(page.getByText("Paste real logistics")).toBeVisible();
  await expect(page.getByText(/Add kids and another adult or helper, paste a real logistics note/)).toBeVisible();
  await expect(page.getByText(/Review against the source before treating an AI-created card as final/)).toBeVisible();
  await expect(page.getByText("inbox@famtandem.app")).toHaveCount(0);

  const pasteForm = page.locator("#add-logistics");
  await pasteForm.scrollIntoViewIfNeeded();
  await pasteForm.getByLabel("Source title").fill(sourceTitle);
  await pasteForm.getByLabel("Pasted text").fill(pastedText);
  await expect(pasteForm.getByLabel("Card title")).toHaveCount(0);
  await expect(pasteForm.getByLabel("Coverage slot")).toHaveCount(0);
  await expect(pasteForm.getByLabel("Readiness item")).toHaveCount(0);
  await pasteForm.getByRole("button", { name: "Read source" }).click();

  await expect(page).toHaveURL(/\/app\/sources\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: sourceTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Extraction run" })).toBeVisible();
  await expect(page.getByText("local-stub", { exact: true })).toBeVisible();
  await expect(page.getByText("local-stub-v1", { exact: true })).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();
  await expect(page.getByText(pastedText)).toBeVisible();
  await expect(page.getByText("No actionable coverage cards were found in this source.")).toBeVisible();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase
    .from("source_inputs")
    .select(
      "id, submitted_by, source_type, status, raw_subject, normalized_text, coverage_cards(id, title, full_source_ref, readiness_items(label), coverage_slots(kind, state)), extraction_runs(id, status, attempts, provider, model, card_count, no_action_reason)"
    )
    .eq("source_type", "paste")
    .eq("raw_subject", sourceTitle)
    .order("created_at", { ascending: false })
    .limit(1)
    .single<{
      id: string;
      submitted_by: string;
      source_type: string;
      status: string;
      raw_subject: string;
      normalized_text: string;
      coverage_cards: {
        id: string;
        title: string;
        full_source_ref: string;
        readiness_items: { label: string }[];
        coverage_slots: { kind: string; state: string }[];
      }[];
      extraction_runs: {
        id: string;
        status: string;
        attempts: number;
        provider: string;
        model: string;
        card_count: number;
        no_action_reason: string | null;
      }[];
    }>();

  expect(error).toBeNull();
  expect(data?.status).toBe("needs_review");
  expect(data?.normalized_text).toBe(pastedText);
  expect(data?.coverage_cards).toHaveLength(0);
  expect(data?.extraction_runs).toHaveLength(1);
  expect(data?.extraction_runs[0]).toMatchObject({
    status: "succeeded",
    attempts: 1,
    provider: "local-stub",
    model: "local-stub-v1",
    card_count: 0
  });
  const { data: extractionJob, error: extractionJobError } = await supabase
    .from("jobs")
    .select("status")
    .eq("kind", "extract_source")
    .eq("payload->>extraction_run_id", data!.extraction_runs[0].id)
    .single<{ status: string }>();
  expect(extractionJobError).toBeNull();
  expect(extractionJob?.status).toBe("succeeded");

  const { data: processedSource, error: processedSourceError } = await supabase
    .from("source_inputs")
    .select("status, extraction_runs(status, attempts, model, card_count, no_action_reason), coverage_cards(id)")
    .eq("id", data!.id)
    .single<{
      status: string;
      extraction_runs: {
        status: string;
        attempts: number;
        model: string;
        card_count: number;
        no_action_reason: string | null;
      }[];
      coverage_cards: { id: string }[];
    }>();
  expect(processedSourceError).toBeNull();
  expect(processedSource?.extraction_runs[0]).toMatchObject({
    status: "succeeded",
    attempts: 1
  });
  const createdCardCount = processedSource?.extraction_runs[0]?.card_count ?? 0;
  const extractionModel = processedSource?.extraction_runs[0]?.model ?? "local-stub-v1";
  expect(processedSource?.status).toBe(createdCardCount > 0 ? "processed" : "needs_review");
  expect(processedSource?.coverage_cards).toHaveLength(createdCardCount);
  if (createdCardCount === 0) {
    expect(processedSource?.extraction_runs[0]?.no_action_reason).toMatch(/stub-extractor/);
  }

  await page.reload();
  await expect(page.getByText("succeeded")).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();
  if (createdCardCount === 0) {
    await expect(page.getByText("needs review")).toBeVisible();
    await expect(page.getByText("No actionable coverage cards were found in this source.")).toBeVisible();
  } else {
    await expect(page.getByText("processed")).toBeVisible();
    await expect(page.getByText(`${createdCardCount} linked card`)).toBeVisible();
  }
  await page.getByRole("link", { name: "Back to board" }).click();
  await expect(page.getByRole("heading", { name: "Coverage board" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inbox" }).first()).toHaveAttribute("href", "/app/inbox");
  await page.goto("/app/inbox");
  await expect(page.getByRole("heading", { name: "Source inbox" })).toBeVisible();
  await expect(page.getByText(sourceTitle)).toBeVisible();
  if (createdCardCount === 0) {
    await expect(page.getByText("No actionable cards found")).toBeVisible();
  } else {
    await expect(page.getByText("Cards created")).toBeVisible();
    await expect(page.getByText(`${createdCardCount} linked card${createdCardCount === 1 ? "" : "s"}`)).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Review source" })).toHaveAttribute(
    "href",
    `/app/sources/${data!.id}`
  );
  await expect(page.getByText(pastedText)).toHaveCount(0);

  const { error: parentRoleError } = await supabase
    .from("household_members")
    .update({ role: "parent" })
    .eq("id", data!.submitted_by);
  expect(parentRoleError).toBeNull();
  await page.goto(`/app/sources/${data!.id}`);
  await expect(page.getByRole("heading", { name: "Extraction run" })).toBeVisible();
  await expect(page.getByText(extractionModel, { exact: true })).toBeVisible();

  const { error: roleError } = await supabase
    .from("household_members")
    .update({ role: "helper" })
    .eq("id", data!.submitted_by);
  expect(roleError).toBeNull();
  await page.goto("/app/inbox");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await page.goto(`/app/sources/${data!.id}`);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("household admin can upload one logistics source file directly to storage", async ({
  page,
  request
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for authenticated upload intake smoke coverage."
  );

  const email = `upload-e2e-${testInfo.project.name}-${randomUUID()}@example.com`;
  const uploadTitle = `Upload intake E2E ${testInfo.project.name} ${randomUUID()}`;
  const fileName = "pickup-note.txt";
  const fileBody = "Coach update: pickup is at the north field gate at 5:30 PM.";

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });

  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill("Upload E2E family");
    await page.getByLabel("Your name").fill("Krish");
    await page.getByLabel(/I understand and agree/).check();
    await page.getByRole("button", { name: "Create household" }).click();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
  }

  const uploadForm = page.getByRole("form", { name: "Upload file or screenshot" });
  await uploadForm.scrollIntoViewIfNeeded();
  await uploadForm.getByLabel("Upload title").fill(uploadTitle);
  await uploadForm.getByLabel("File").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from(fileBody)
  });
  await uploadForm.getByRole("button", { name: "Upload source" }).click();

  await expect(page).toHaveURL(/\/app\/sources\/[0-9a-f-]+/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: uploadTitle })).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^needs review$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Extraction run" })).toBeVisible();
  await expect(page.getByText("local-stub-v1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Uploaded files" })).toBeVisible();
  await expect(page.getByText(fileName, { exact: true })).toBeVisible();
  await expect(page.getByText("text/plain")).toBeVisible();
  await expect(page.getByText("source-artifacts")).toHaveCount(0);
  await expect(page.getByText("SHA-256")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Linked cards" })).toBeVisible();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase
    .from("source_inputs")
    .select(
      "id, submitted_by, source_type, status, raw_subject, normalized_text, source_artifacts(storage_path, original_file_name, mime_type, file_size_bytes, text_extraction_status)"
    )
    .eq("source_type", "upload")
    .eq("raw_subject", uploadTitle)
    .order("created_at", { ascending: false })
    .limit(1)
    .single<{
      id: string;
      submitted_by: string;
      source_type: string;
      status: string;
      raw_subject: string;
      normalized_text: string | null;
      source_artifacts: {
        storage_path: string;
        original_file_name: string;
        mime_type: string;
        file_size_bytes: number;
        text_extraction_status: string;
      }[];
    }>();

  expect(error).toBeNull();
  expect(data?.status).toBe("needs_review");
  expect([null, fileBody]).toContain(data?.normalized_text);
  expect(data?.source_artifacts[0]).toMatchObject({
    original_file_name: fileName,
    mime_type: "text/plain",
    file_size_bytes: Buffer.byteLength(fileBody)
  });
  expect(["pending", "needs_review"]).toContain(data?.source_artifacts[0]?.text_extraction_status);

  await expect
    .poll(async () => {
      const cronResponse = await request.get("/api/cron/jobs", {
        headers: { "x-cron-secret": process.env.CRON_SECRET ?? "local-development-cron-secret" }
      });
      expect(cronResponse.ok()).toBe(true);
      const { data: artifact } = await supabase
        .from("source_artifacts")
        .select("text_extraction_status")
        .eq("source_input_id", data!.id)
        .single<{ text_extraction_status: string }>();
      return artifact?.text_extraction_status;
    }, { timeout: 60_000 })
    .toBe("needs_review");

  await page.goto("/app/inbox");
  await expect(page.getByRole("heading", { name: "Source inbox" })).toBeVisible();
  await expect(page.getByText(uploadTitle)).toBeVisible();
  await expect(page.getByText("Ready to approve text")).toBeVisible();
  await expect(page.getByText("Review extracted text before cards are created.")).toBeVisible();
  await expect(page.getByText(fileBody)).toHaveCount(0);
  await expect(page.getByText("source-artifacts")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Review source" })).toHaveAttribute(
    "href",
    `/app/sources/${data!.id}`
  );

  const storagePath = data!.source_artifacts[0]!.storage_path;
  expect(storagePath).toContain(`${data!.id}/`);
  await expect(page.getByText(storagePath)).toHaveCount(0);

  const userSupabase = await createAuthenticatedUserClient(email);

  const rogueStoragePath = `${storagePath
    .split("/")
    .slice(0, 2)
    .join("/")}/rogue-${randomUUID()}.txt`;
  const { error: rogueUploadError } = await userSupabase.storage
    .from("source-artifacts")
    .upload(rogueStoragePath, Buffer.from("rogue upload without metadata"), {
      contentType: "text/plain",
      upsert: false
    });
  expect(rogueUploadError).not.toBeNull();

  const { data: downloaded, error: downloadError } = await supabase.storage
    .from("source-artifacts")
    .download(storagePath);
  expect(downloadError).toBeNull();
  expect(await downloaded!.text()).toBe(fileBody);

  const { error: roleError } = await supabase
    .from("household_members")
    .update({ role: "helper" })
    .eq("id", data!.submitted_by);
  expect(roleError).toBeNull();

  const { data: helperDownload, error: helperDownloadError } = await userSupabase.storage
    .from("source-artifacts")
    .download(storagePath);
  expect(helperDownload).toBeNull();
  expect(helperDownloadError).not.toBeNull();
});

async function createAuthenticatedUserClient(email: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  let otpError: { message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await supabase.auth.signInWithOtp({ email });
    otpError = result.error;
    if (!otpError) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(otpError).toBeNull();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: await getOtpCode(email),
    type: "email"
  });
  expect(error).toBeNull();
  expect(data.session).not.toBeNull();
  return supabase;
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

async function getOtpCode(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const mailbox = await fetch("http://127.0.0.1:54324/api/v1/messages").then(
      (response) => response.json() as Promise<MailpitMessages>
    );
    const matchingMessages = mailbox.messages.filter((candidate) =>
      candidate.To.some((recipient) => recipient.Address === email)
    );

    for (const message of matchingMessages) {
      const detail = await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`).then(
        (response) => response.json() as Promise<{ Text: string }>
      );
      const match = detail.Text.match(/enter the code:\s*(\d+)/i);
      if (match?.[1]) return match[1];
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No local magic-link OTP found for ${email}`);
}

type MailpitMessages = {
  messages: {
    ID: string;
    To: { Address: string }[];
  }[];
};

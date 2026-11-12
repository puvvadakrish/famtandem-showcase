import { expect, test } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

test("no-account coverage request link can accept coverage", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const token = `coverage-token-${testInfo.project.name}-${Date.now()}`;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const email = `coverage-e2e-${testInfo.project.name}-${Date.now()}@example.com`;
  const { error: otpError } = await userSupabase.auth.signInWithOtp({ email });
  expect(otpError).toBeNull();
  const { data: otpData, error: verifyError } = await userSupabase.auth.verifyOtp({
    email,
    token: await getOtpCode(email),
    type: "email"
  });
  expect(verifyError).toBeNull();
  expect(otpData.session).not.toBeNull();

  const { error: bootstrapError } = await userSupabase.rpc("create_household_bootstrap", {
    household_name: "Coverage E2E family",
    household_slug: `coverage-e2e-${testInfo.project.name}-${Date.now()}`,
    household_timezone: "America/Chicago",
    consent_version: "local-e2e",
    member_display_name: "Krish"
  });
  expect(bootstrapError).toBeNull();

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("id, household_id")
    .eq("user_id", otpData.user!.id)
    .single<{ id: string; household_id: string }>();
  expect(memberError).toBeNull();

  const { data: card, error: cardError } = await supabase
    .from("coverage_cards")
    .insert({
      household_id: member!.household_id,
      card_type: "event",
      title: "Soccer pickup",
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

  const { data: requestRow, error: requestError } = await userSupabase
    .rpc("create_coverage_request", {
      p_card_id: card!.id,
      p_slot_ids: [slot!.id],
      p_token_hash: hashToken(token),
      p_channel: "manual_link",
      p_requested_member_id: member!.id,
      p_requested_external_contact_id: null,
      p_external_display_name: null,
      p_external_email: null,
      p_external_phone: null,
      p_note: "Can you grab pickup?"
    })
    .single<{ request_token_id: string; request_ids: string[] }>();
  expect(requestError).toBeNull();

  await page.goto(`/respond/coverage/${token}`);
  await expect(page.getByRole("heading", { name: "Can you cover this?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Soccer pickup" })).toBeVisible();
  await expect(page.getByText("North field")).toBeVisible();
  await expect(page.getByText("Can you grab pickup?")).toBeVisible();
  await expect(page.getByText("Source: Coach email")).toHaveCount(0);
  await page.getByRole("button", { name: "I can do pickup" }).click();
  await expect(page.getByRole("heading", { name: "Thanks, it's covered." })).toBeVisible();
  await expect(page.getByText("FamTandem updated the coverage board.")).toHaveCount(2);
  await expect(page.getByText("Soccer pickup")).toHaveCount(0);
  await expect(page.getByText("North field")).toHaveCount(0);

  const { data: acceptedSlot, error: acceptedSlotError } = await supabase
    .from("coverage_slots")
    .select("state, owner_member_id")
    .eq("id", slot!.id)
    .single<{ state: string; owner_member_id: string | null }>();
  expect(acceptedSlotError).toBeNull();
  expect(acceptedSlot).toMatchObject({
    state: "accepted",
    owner_member_id: member!.id
  });

  const { data: response, error: responseError } = await supabase
    .from("coverage_responses")
    .select("response, request_id")
    .eq("request_id", requestRow!.request_ids[0])
    .single<{ response: string; request_id: string }>();
  expect(responseError).toBeNull();
  expect(response?.response).toBe("accept_pickup");
});

test("no-account coverage request link can decline coverage", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const setup = await createCoverageRequestFixture(testInfo.project.name, "decline");

  await page.goto(`/respond/coverage/${setup.token}`);
  await expect(page.getByRole("heading", { name: "Can you cover this?" })).toBeVisible();
  await page.getByRole("button", { name: "I can't cover this" }).click();
  await expect(page.getByRole("heading", { name: "Thanks for answering." })).toBeVisible();
  await expect(page.getByText("FamTandem will keep this item in Needs Attention.")).toHaveCount(2);
  await expect(page.getByText("Soccer pickup")).toHaveCount(0);
  await expect(page.getByText("North field")).toHaveCount(0);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: declinedSlot, error: declinedSlotError } = await supabase
    .from("coverage_slots")
    .select("state, owner_member_id")
    .eq("id", setup.slotId)
    .single<{ state: string; owner_member_id: string | null }>();
  expect(declinedSlotError).toBeNull();
  expect(declinedSlot).toMatchObject({
    state: "declined",
    owner_member_id: null
  });
});

test("no-account coverage request POST works when browser origin is null", async ({
  request
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const setup = await createCoverageRequestFixture(testInfo.project.name, "null-origin");

  const response = await request.post(`/respond/coverage/${setup.token}/submit`, {
    form: {
      response: "accept_pickup"
    },
    headers: {
      origin: "null"
    },
    maxRedirects: 0
  });

  expect(response.status()).toBe(303);
  const redirectUrl = new URL(response.headers().location!);
  expect(`${redirectUrl.origin}${redirectUrl.pathname}`).toBe(
    new URL(
      `/respond/coverage/${setup.token}`,
      process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"
    ).toString()
  );
  expect(redirectUrl.searchParams.get("status")).toBe("accepted");
  expect(redirectUrl.searchParams.get("statusProof")).toBeTruthy();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: acceptedSlot, error: acceptedSlotError } = await supabase
    .from("coverage_slots")
    .select("state, owner_member_id")
    .eq("id", setup.slotId)
    .single<{ state: string; owner_member_id: string | null }>();
  expect(acceptedSlotError).toBeNull();
  expect(acceptedSlot).toMatchObject({
    state: "accepted",
    owner_member_id: setup.memberId
  });
});

test("invalid coverage request links do not expose household details", async ({ page }) => {
  await page.goto("/respond/coverage/not-a-real-token?status=accepted");

  await expect(page.getByRole("heading", { name: "This link is not available." })).toBeVisible();
  await expect(page.getByText("This request link is no longer available.")).toBeVisible();
  await expect(page.getByRole("button", { name: /cover/ })).toHaveCount(0);
});

test("used coverage request links do not keep exposing household details", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const setup = await createCoverageRequestFixture(testInfo.project.name, "used");

  await page.goto(`/respond/coverage/${setup.token}`);
  await expect(page.getByRole("heading", { name: "Soccer pickup" })).toBeVisible();
  await page.getByRole("button", { name: "I can do pickup" }).click();
  await expect(page.getByRole("heading", { name: "Thanks, it's covered." })).toBeVisible();
  await expect(page.getByText("Soccer pickup")).toHaveCount(0);
  await expect(page.getByText("North field")).toHaveCount(0);

  await page.goto(`/respond/coverage/${setup.token}`);
  await expect(page.getByRole("heading", { name: "This request was already answered." })).toBeVisible();
  await expect(page.getByText("Soccer pickup")).toHaveCount(0);
  await expect(page.getByText("North field")).toHaveCount(0);

  await page.goto(`/respond/coverage/${setup.token}?status=declined`);
  await expect(page.getByRole("heading", { name: "This request was already answered." })).toBeVisible();
  await expect(page.getByText("Soccer pickup")).toHaveCount(0);
  await expect(page.getByText("North field")).toHaveCount(0);
});

test("household admin can create a manual coverage response link from the board", async ({
  browser,
  page
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const email = `coverage-composer-${testInfo.project.name}-${randomUUID()}@example.com`;
  const cardTitle = `Coverage composer pickup ${testInfo.project.name} ${randomUUID()}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });

  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill("Coverage composer family");
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
      source_summary: "Manual E2E setup",
      computed_coverage_state: "needs_coverage",
      attention_flags: ["needs_coverage"],
      created_by: member!.id,
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

  await page.goto("/app");
  const cardArticle = page.locator("article", { hasText: cardTitle });
  await expect(cardArticle).toBeVisible();
  await cardArticle.getByRole("link", { name: "Ask for coverage" }).click();
  await cardArticle.getByLabel("Ask someone else").fill("Grandma");
  await cardArticle.getByLabel("Message shown to recipient").last().fill("Can you grab pickup?");
  await cardArticle.getByRole("button", { name: "Send or create link" }).last().click();

  await page.waitForURL(/\/app\?coverageRequest=created/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Response link ready" })).toBeVisible();
  const responseLink = await page.getByLabel("Coverage request link").inputValue();
  expect(responseLink).toContain("/respond/coverage/");
  expect(page.url()).not.toContain("/respond/coverage/");

  const { data: request, error: requestError } = await supabase
    .from("coverage_requests")
    .select("status, channel, provider_message_id, coverage_request_tokens(id)")
    .eq("slot_id", slot!.id)
    .single<{
      status: string;
      channel: string;
      provider_message_id: string | null;
      coverage_request_tokens: { id: string } | { id: string }[] | null;
    }>();
  expect(requestError).toBeNull();
  expect(request).toMatchObject({
    status: "pending",
    channel: "manual_link"
  });

  const responseContext = await browser.newContext();
  const responsePage = await responseContext.newPage();
  await responsePage.goto(responseLink);
  await expect(responsePage.getByRole("heading", { name: "Can you cover this?" })).toBeVisible();
  await responsePage.getByRole("button", { name: "I can do pickup" }).click();
  await expect(responsePage.getByRole("heading", { name: "Thanks, it's covered." })).toBeVisible();
  await responseContext.close();

  const { data: acceptedSlot, error: acceptedSlotError } = await supabase
    .from("coverage_slots")
    .select("state")
    .eq("id", slot!.id)
    .single<{ state: string }>();
  expect(acceptedSlotError).toBeNull();
  expect(acceptedSlot?.state).toBe("accepted");
});

test("household admin can email an existing household member coverage request", async ({
  page
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const email = `coverage-member-email-${testInfo.project.name}-${randomUUID()}@example.com`;
  const requestedEmail = `coverage-requested-member-${testInfo.project.name}-${randomUUID()}@example.com`;
  const cardTitle = `Coverage member email pickup ${testInfo.project.name} ${randomUUID()}`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.waitForURL(/login\?sent=1/, { timeout: 15_000 });

  await page.goto(await getMagicLink(email));
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 15_000 });

  if (page.url().includes("/household/new")) {
    await page.getByLabel("Household name").fill("Coverage member email family");
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
  const { data: adminMember, error: memberError } = await supabase
    .from("household_members")
    .select("id, household_id")
    .eq("email", email)
    .single<{ id: string; household_id: string }>();
  expect(memberError).toBeNull();

  const { data: requestedMember, error: requestedMemberError } = await supabase
    .from("household_members")
    .insert({
      household_id: adminMember!.household_id,
      display_name: "Maya Parent",
      role: "parent",
      email: requestedEmail,
      active: true
    })
    .select("id")
    .single<{ id: string }>();
  expect(requestedMemberError).toBeNull();

  const { data: card, error: cardError } = await supabase
    .from("coverage_cards")
    .insert({
      household_id: adminMember!.household_id,
      card_type: "event",
      title: cardTitle,
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      location: "North field",
      source_summary: "Manual E2E setup",
      computed_coverage_state: "needs_coverage",
      attention_flags: ["needs_coverage"],
      created_by: adminMember!.id,
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

  await page.goto("/app");
  const cardArticle = page.locator("article", { hasText: cardTitle });
  await expect(cardArticle).toBeVisible();
  await cardArticle.getByRole("link", { name: "Ask for coverage" }).click();
  await cardArticle.getByLabel("Ask someone in the household").selectOption(requestedMember!.id);
  await cardArticle.getByLabel("Coverage request delivery").first().selectOption("email");
  await cardArticle.getByLabel("Message shown to recipient").first().fill("Can you grab pickup?");
  await cardArticle.getByRole("button", { name: "Send or create link" }).first().click();

  await page.waitForURL(/\/app\?coverageRequest=created/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Response link ready" })).toBeVisible();

  const { data: request, error: requestError } = await supabase
    .from("coverage_requests")
    .select("status, channel, provider, requested_member_id, requested_external_contact_id")
    .eq("slot_id", slot!.id)
    .single<{
      status: string;
      channel: string;
      provider: string | null;
      requested_member_id: string | null;
      requested_external_contact_id: string | null;
    }>();
  expect(requestError).toBeNull();
  expect(request).toMatchObject({
    status: "pending",
    channel: "email",
    provider: "local-stub",
    requested_member_id: requestedMember!.id,
    requested_external_contact_id: null
  });
});

test("single non-transport coverage request can be accepted", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const setup = await createCoverageRequestFixture(testInfo.project.name, "stay", "stay_attend");

  await page.goto(`/respond/coverage/${setup.token}`);
  await expect(page.getByRole("heading", { name: "Soccer pickup" })).toBeVisible();
  await page.getByRole("button", { name: "I can cover it" }).click();
  await expect(page.getByRole("heading", { name: "Thanks, it's covered." })).toBeVisible();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: acceptedSlot, error: acceptedSlotError } = await supabase
    .from("coverage_slots")
    .select("state, owner_member_id")
    .eq("id", setup.slotId)
    .single<{ state: string; owner_member_id: string | null }>();
  expect(acceptedSlotError).toBeNull();
  expect(acceptedSlot).toMatchObject({
    state: "accepted",
    owner_member_id: setup.memberId
  });
});

test("stale pending request links do not expose household details", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const setup = await createCoverageRequestFixture(testInfo.project.name, "stale");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: acceptError } = await supabase.rpc("respond_to_coverage_request", {
    p_token_hash: hashToken(setup.token),
    p_response: "accept_pickup"
  });
  expect(acceptError).toBeNull();
  const { error: staleRequestError } = await supabase
    .from("coverage_requests")
    .update({ status: "pending" })
    .eq("id", setup.requestIds[0]);
  expect(staleRequestError).toBeNull();
  const { error: staleTokenError } = await supabase
    .from("coverage_request_tokens")
    .update({ used_at: null })
    .eq("id", setup.requestTokenId);
  expect(staleTokenError).toBeNull();

  await page.goto(`/respond/coverage/${setup.token}`);
  await expect(page.getByRole("heading", { name: "This request was already answered." })).toBeVisible();
  await expect(page.getByText("Soccer pickup")).toHaveCount(0);
  await expect(page.getByText("North field")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /cover/ })).toHaveCount(0);
});

test("mixed stale and live request token cannot decline the live slot from a stale choice", async ({
  page
}, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const setup = await createTwoSlotCoverageRequestFixture(testInfo.project.name, "mixed-stale");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: requests, error: requestsError } = await supabase
    .from("coverage_requests")
    .select("id, slot_id, coverage_slots(kind)")
    .eq("request_token_id", setup.requestTokenId);
  expect(requestsError).toBeNull();
  const pickupRequest = requests?.find((request) => one(request.coverage_slots)?.kind === "pickup");
  expect(pickupRequest).toBeDefined();
  const { error: stalePickupError } = await supabase
    .from("coverage_requests")
    .update({ status: "cancelled" })
    .eq("id", pickupRequest!.id);
  expect(stalePickupError).toBeNull();

  await page.goto(`/respond/coverage/${setup.token}`);
  await expect(page.getByRole("heading", { name: "Can you cover this?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "I can do pickup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I can do drop-off" })).toBeVisible();

  const { error: staleChoiceError } = await supabase.rpc("respond_to_coverage_request", {
    p_token_hash: hashToken(setup.token),
    p_response: "accept_pickup"
  });
  expect(staleChoiceError).toBeNull();

  const { data: dropoffSlot, error: dropoffSlotError } = await supabase
    .from("coverage_slots")
    .select("state")
    .eq("id", setup.dropoffSlotId)
    .single<{ state: string }>();
  expect(dropoffSlotError).toBeNull();
  expect(dropoffSlot?.state).toBe("requested");
});

test("expired token retry cannot reset a newer pending request", async ({ page }, testInfo) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Local Supabase env is required for coverage request smoke coverage."
  );

  const oldSetup = await createCoverageRequestFixture(testInfo.project.name, "expired-old");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: expireError } = await supabase
    .from("coverage_request_tokens")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", oldSetup.requestTokenId);
  expect(expireError).toBeNull();
  const { error: oldExpiredError } = await supabase.rpc("respond_to_coverage_request", {
    p_token_hash: hashToken(oldSetup.token),
    p_response: "accept_pickup"
  });
  expect(oldExpiredError).toBeNull();

  const newToken = `coverage-token-expired-new-${testInfo.project.name}-${Date.now()}`;
  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: sessionError } = await userSupabase.auth.setSession({
    access_token: oldSetup.accessToken,
    refresh_token: oldSetup.refreshToken
  });
  expect(sessionError).toBeNull();
  const { error: newRequestError } = await userSupabase.rpc("create_coverage_request", {
    p_card_id: oldSetup.cardId,
    p_slot_ids: [oldSetup.slotId],
    p_token_hash: hashToken(newToken),
    p_channel: "manual_link",
    p_requested_member_id: oldSetup.memberId,
    p_requested_external_contact_id: null,
    p_external_display_name: null,
    p_external_email: null,
    p_external_phone: null,
    p_note: "Fresh ask"
  });
  expect(newRequestError).toBeNull();

  const { error: oldRetryError } = await supabase.rpc("respond_to_coverage_request", {
    p_token_hash: hashToken(oldSetup.token),
    p_response: "accept_pickup"
  });
  expect(oldRetryError).toBeNull();

  await page.goto(`/respond/coverage/${oldSetup.token}`);
  await expect(page.getByRole("heading", { name: "This request expired." })).toBeVisible();

  const { data: slotAfterOldRetry, error: slotAfterOldRetryError } = await supabase
    .from("coverage_slots")
    .select("state")
    .eq("id", oldSetup.slotId)
    .single<{ state: string }>();
  expect(slotAfterOldRetryError).toBeNull();
  expect(slotAfterOldRetry?.state).toBe("requested");
});

function hashToken(token: string) {
  return createHmac("sha256", process.env.COVERAGE_REQUEST_TOKEN_SECRET ?? process.env.CRON_SECRET!)
    .update(token)
    .digest("hex");
}

async function createCoverageRequestFixture(
  projectName: string,
  suffixLabel: string,
  slotKind: "pickup" | "stay_attend" = "pickup"
) {
  const token = `coverage-token-${suffixLabel}-${projectName}-${Date.now()}`;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const email = `coverage-${suffixLabel}-${projectName}-${Date.now()}@example.com`;
  const { error: otpError } = await userSupabase.auth.signInWithOtp({ email });
  expect(otpError).toBeNull();
  const { data: otpData, error: verifyError } = await userSupabase.auth.verifyOtp({
    email,
    token: await getOtpCode(email),
    type: "email"
  });
  expect(verifyError).toBeNull();
  expect(otpData.session).not.toBeNull();

  const { error: bootstrapError } = await userSupabase.rpc("create_household_bootstrap", {
    household_name: `Coverage ${suffixLabel} E2E family`,
    household_slug: `coverage-${suffixLabel}-${projectName}-${Date.now()}`,
    household_timezone: "America/Chicago",
    consent_version: "local-e2e",
    member_display_name: "Krish"
  });
  expect(bootstrapError).toBeNull();

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("id, household_id")
    .eq("user_id", otpData.user!.id)
    .single<{ id: string; household_id: string }>();
  expect(memberError).toBeNull();

  const { data: card, error: cardError } = await supabase
    .from("coverage_cards")
    .insert({
      household_id: member!.household_id,
      card_type: "event",
      title: "Soccer pickup",
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

  const { data: slot, error: slotError } = await supabase
    .from("coverage_slots")
    .insert({
      card_id: card!.id,
      kind: slotKind,
      state: "needs_coverage"
    })
    .select("id")
    .single<{ id: string }>();
  expect(slotError).toBeNull();

  const { data: requestRow, error: requestError } = await userSupabase
    .rpc("create_coverage_request", {
      p_card_id: card!.id,
      p_slot_ids: [slot!.id],
      p_token_hash: hashToken(token),
      p_channel: "manual_link",
      p_requested_member_id: member!.id,
      p_requested_external_contact_id: null,
      p_external_display_name: null,
      p_external_email: null,
      p_external_phone: null,
      p_note: "Can you grab pickup?"
    })
    .single<{ request_token_id: string; request_ids: string[] }>();
  expect(requestError).toBeNull();

  return {
    cardId: card!.id,
    email,
    accessToken: otpData.session!.access_token,
    refreshToken: otpData.session!.refresh_token,
    memberId: member!.id,
    token,
    requestTokenId: requestRow!.request_token_id,
    slotId: slot!.id,
    requestIds: requestRow!.request_ids
  };
}

async function createTwoSlotCoverageRequestFixture(projectName: string, suffixLabel: string) {
  const token = `coverage-token-${suffixLabel}-${projectName}-${Date.now()}`;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const email = `coverage-${suffixLabel}-${projectName}-${Date.now()}@example.com`;
  const { error: otpError } = await userSupabase.auth.signInWithOtp({ email });
  expect(otpError).toBeNull();
  const { data: otpData, error: verifyError } = await userSupabase.auth.verifyOtp({
    email,
    token: await getOtpCode(email),
    type: "email"
  });
  expect(verifyError).toBeNull();
  expect(otpData.session).not.toBeNull();

  const { error: bootstrapError } = await userSupabase.rpc("create_household_bootstrap", {
    household_name: `Coverage ${suffixLabel} E2E family`,
    household_slug: `coverage-${suffixLabel}-${projectName}-${Date.now()}`,
    household_timezone: "America/Chicago",
    consent_version: "local-e2e",
    member_display_name: "Krish"
  });
  expect(bootstrapError).toBeNull();

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("id, household_id")
    .eq("user_id", otpData.user!.id)
    .single<{ id: string; household_id: string }>();
  expect(memberError).toBeNull();

  const { data: card, error: cardError } = await supabase
    .from("coverage_cards")
    .insert({
      household_id: member!.household_id,
      card_type: "event",
      title: "Soccer transport",
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

  const { data: slots, error: slotsError } = await supabase
    .from("coverage_slots")
    .insert([
      {
        card_id: card!.id,
        kind: "dropoff",
        state: "needs_coverage"
      },
      {
        card_id: card!.id,
        kind: "pickup",
        state: "needs_coverage"
      }
    ])
    .select("id, kind");
  expect(slotsError).toBeNull();
  const dropoffSlot = slots?.find((slot) => slot.kind === "dropoff");
  const pickupSlot = slots?.find((slot) => slot.kind === "pickup");
  expect(dropoffSlot).toBeDefined();
  expect(pickupSlot).toBeDefined();

  const { data: requestRow, error: requestError } = await userSupabase
    .rpc("create_coverage_request", {
      p_card_id: card!.id,
      p_slot_ids: [dropoffSlot!.id, pickupSlot!.id],
      p_token_hash: hashToken(token),
      p_channel: "manual_link",
      p_requested_member_id: member!.id,
      p_requested_external_contact_id: null,
      p_external_display_name: null,
      p_external_email: null,
      p_external_phone: null,
      p_note: "Can you handle transport?"
    })
    .single<{ request_token_id: string; request_ids: string[] }>();
  expect(requestError).toBeNull();

  return {
    dropoffSlotId: dropoffSlot!.id,
    pickupSlotId: pickupSlot!.id,
    requestTokenId: requestRow!.request_token_id,
    token
  };
}

function one<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
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

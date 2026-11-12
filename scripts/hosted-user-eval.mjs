#!/usr/bin/env node

import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const baseUrl = (process.env.FAMTANDEM_USER_EVAL_BASE_URL ?? "https://app.famtandem.com").replace(
  /\/$/,
  ""
);
const account = process.env.FAMTANDEM_USER_EVAL_EMAIL ?? "test-user@example.com";
const mailbox = process.env.FAMTANDEM_USER_EVAL_MAILBOX ?? account;
const stamp =
  process.env.FAMTANDEM_USER_EVAL_STAMP ??
  new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
const helperAccount =
  process.env.FAMTANDEM_USER_EVAL_HELPER_EMAIL ??
  account.replace("@", `+qa-user-eval-helper-${stamp}@`);
const helperMailbox = process.env.FAMTANDEM_USER_EVAL_HELPER_MAILBOX ?? mailbox;
const sparkFromFilter =
  process.env.FAMTANDEM_USER_EVAL_SPARK_FROM ?? "from:coverage@updates.famtandem.com";
const outputDir = join(process.cwd(), "output", "playwright", "hosted-user-eval", stamp);

if (args.has("--help") || args.has("-h")) {
  printHelp();
  process.exit(0);
}

if (process.env.CONFIRM_HOSTED_USER_EVAL !== "1") {
  console.error(
    [
      "Refusing to run hosted user evaluation without explicit confirmation.",
      "",
      "This command creates additive timestamped test data in the hosted FamTandem app.",
      "Run intentionally with:",
      "  CONFIRM_HOSTED_USER_EVAL=1 npm run test:user-eval:hosted",
      "",
      "Optional overrides:",
      "  FAMTANDEM_USER_EVAL_EMAIL=test-user@example.com",
      "  FAMTANDEM_USER_EVAL_MAILBOX=test-user@example.com",
      "  FAMTANDEM_USER_EVAL_HELPER_EMAIL=test-user+famtandem-helper-20260604@example.com",
      "  FAMTANDEM_USER_EVAL_HELPER_MAILBOX=test-user@example.com",
      "  FAMTANDEM_USER_EVAL_BASE_URL=https://app.famtandem.com",
      "  FAMTANDEM_USER_EVAL_STAMP=202605311411"
    ].join("\n")
  );
  process.exit(2);
}

const screenshots = [];
const browserErrors = [];
const ignoredNetworkEvents = [];
const summaryPath = join(outputDir, "summary.json");
const runSummary = {
  status: "failed",
  baseUrl,
  account,
  stamp,
  children: [],
  helper: null,
  externalRecipient: null,
  helperEmail: helperAccount,
  helperMailbox,
  helperInviteStatus: null,
  sessionPersistenceStatus: null,
  responseUrl: null,
  coverageResponseFinalUrl: null,
  coverageResponseStatus: null,
  screenshots,
  consoleErrors: [],
  networkErrors: [],
  ignoredNetworkEvents: []
};

async function main() {
  assertTool("spark", ["accounts"]);
  mkdirSync(outputDir, { recursive: true });

  let browser;
  let wroteSummary = false;
  try {
    const login = await loginWithFreshMagicLink();
    browser = login.browser;
    const { context, page } = login;

    const childA = `QA User Eval Ava ${stamp}`;
    const childB = `QA User Eval Leo ${stamp}`;
    const childC = `QA User Eval Nina ${stamp}`;
    const helper = `QA User Eval Helper ${stamp}`;
    const grandma = `QA User Eval Grandma ${stamp}`;
    runSummary.children = [childA, childB, childC];
    runSummary.helper = helper;
    runSummary.externalRecipient = grandma;

    await addChild(page, childA, "4th grade");
    await addChild(page, childB, "1st grade");
    await addChild(page, childC, "Kindergarten");
    const helperMailboxBeforeIds = sparkEmailIds(helperMailbox);
    const helperMailboxBefore = helperMailboxBeforeIds.length ? Math.max(...helperMailboxBeforeIds) : 0;
    await addHelper(page, helper, helperAccount);
    await verifyHelperInviteIfConfigured({
      browser,
      helper,
      helperEmail: helperAccount,
      helperMailbox,
      mailboxBefore: helperMailboxBefore
    });
    await screenshot(page, "people-added");

    const soccerTitle = `QA User Eval Source 1 Soccer ${stamp}`;
    const soccerText = `Coach update for ${childA}: Soccer practice is Tuesday, June 9, 2026 from 5:30 PM to 6:45 PM at North Field gate. Pickup still needs an owner. Please bring cleats, shin guards, and a water bottle.`;
    await pasteSource(page, soccerTitle, soccerText, {
      mustInclude: ["succeeded", "1 / 3", "linked card", "5:30 PM"],
      mustExclude: ["4:30 PM", "9:30 PM"],
      minOccurrences: { "5:30 PM": 2 }
    });

    await pasteSource(
      page,
      `QA User Eval Source 2 Field Trip ${stamp}`,
      `School note for ${childB}: Field trip is Thursday, June 11, 2026 from 9:00 AM to 2:00 PM at Science Museum. Permission slip is due Monday, June 8, 2026. Parent needs to pack lunch and send $5.`,
      { mustInclude: ["succeeded", "1 / 3", "linked card"] }
    );

    await pasteSource(
      page,
      `QA User Eval Source 3 Dentist ${stamp}`,
      `Dentist reminder for ${childA}: Appointment is Friday, June 12, 2026 at 4:00 PM at Bright Smiles Dental. Parent needs to pick up from aftercare at 3:30 PM and bring the insurance card.`,
      { mustInclude: ["succeeded", "1 / 3", "linked card"] }
    );

    await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Coverage board" })).toBeVisible({
      timeout: 30_000
    });
    await page.waitForTimeout(2_000);

    const soccerCard = page.locator("article").filter({ hasText: soccerText }).first();
    await expect(soccerCard).toBeVisible({ timeout: 30_000 });
    await expect(soccerCard).toContainText("Tue, Jun 9, 5:30 PM");
    await expect(soccerCard).not.toContainText("4:30 PM");
    await expect(soccerCard).not.toContainText("9:30 PM");
    await screenshot(page, "board-soccer-card");

    const externalInput = soccerCard.locator('input[name="externalDisplayName"]').first();
    await externalInput.fill(grandma);
    const externalForm = externalInput.locator("xpath=ancestor::form");
    await externalForm.locator('textarea[name="note"]').fill("Can you cover pickup?");
    await externalForm.getByRole("button", { name: "Send or create link" }).click();
    await page.waitForURL(/coverageRequest=created/, { timeout: 30_000 });
    const responseUrl = await page.locator("#coverage-request-response-link").inputValue();
    if (!responseUrl.includes("/respond/coverage/")) {
      throw new Error(`Expected coverage response URL, received: ${responseUrl}`);
    }
    runSummary.responseUrl = redactCoverageToken(responseUrl);
    await screenshot(page, "response-link-ready");

    const mobile = await context.newPage();
    registerPageListeners(mobile, "mobile");
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(responseUrl, { waitUntil: "networkidle" });
    await expect(mobile.getByRole("heading", { name: "Can you cover this?" })).toBeVisible({
      timeout: 30_000
    });
    const responseBody = await mobile.locator("body").innerText();
    assertIncludes(responseBody, "Tue, Jun 9, 5:30 PM", "mobile response corrected time");
    assertExcludes(responseBody, soccerText, "mobile response raw source text");
    assertExcludes(responseBody, soccerTitle, "mobile response source title");
    assertExcludes(responseBody, "4:30 PM", "mobile response stale extracted time");
    assertExcludes(responseBody, "9:30 PM", "mobile response UTC drift time");
    await screenshot(mobile, "mobile-response-page");
    await mobile.getByRole("button", { name: /I can do pickup|I can cover it/ }).first().click();
    await expect(mobile.getByRole("heading", { name: "Thanks, it's covered." })).toBeVisible({
      timeout: 30_000
    });
    await expect(mobile.getByText("FamTandem updated the coverage board.").first()).toBeVisible();
    runSummary.coverageResponseFinalUrl = redactCoverageToken(mobile.url());
    runSummary.coverageResponseStatus = new URL(mobile.url()).searchParams.get("status");
    await screenshot(mobile, "mobile-response-accepted");
    await mobile.close();

    await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Coverage board" })).toBeVisible({
      timeout: 30_000
    });
    await screenshot(page, "board-after-response");

    const relevantErrors = relevantBrowserErrors();
    const summary = writeSummary({ status: relevantErrors.length ? "failed" : "passed" });
    wroteSummary = true;
    console.log(JSON.stringify(summary, null, 2));

    if (relevantErrors.length > 0) {
      throw new Error(`Browser console/page errors were observed. See ${summaryPath}`);
    }
  } catch (error) {
    if (!wroteSummary) {
      const summary = writeSummary({
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(JSON.stringify(summary, null, 2));
    }
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function loginWithFreshMagicLink() {
  const magicLink = await sendFreshMagicLink();
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  registerPageListeners(page, "desktop");

  await page.goto(magicLink, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForURL(/\/(app|household\/new)/, { timeout: 30_000 });
  await completeHouseholdSetupIfNeeded(page);

  await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
  await completeHouseholdSetupIfNeeded(page);
  await expectCoverageBoard(page);
  await verifyDeviceSessionPersistence(page);
  return { browser, context, page };
}

async function verifyDeviceSessionPersistence(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/app/, { timeout: 30_000 });
  await expectCoverageBoard(page);

  await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
  await expectCoverageBoard(page);

  const reopened = await page.context().newPage();
  registerPageListeners(reopened, "desktop-reopened-tab");
  await reopened.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
  await expectCoverageBoard(reopened);
  await screenshot(reopened, "session-persistence-reopened-tab");
  await reopened.close();

  runSummary.sessionPersistenceStatus = "same_context_new_tab_reused_without_new_magic_link";
  await screenshot(page, "session-persistence-board");
}

async function completeHouseholdSetupIfNeeded(page) {
  const needsHousehold = await page
    .getByLabel("Household name")
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  if (!needsHousehold) return;

  await page.getByLabel("Household name").fill(`QA User Eval Family ${stamp}`);
  await page.getByLabel("Your name").fill("Krish");
  await page.getByLabel("Timezone").fill("America/Chicago");
  await page.getByLabel(/I understand and agree/).check();
  await page.getByRole("button", { name: "Create household" }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

async function expectCoverageBoard(page) {
  try {
    await expect(page.getByRole("heading", { name: "Coverage board" })).toBeVisible({
      timeout: 30_000
    });
  } catch (error) {
    await screenshot(page, "coverage-board-missing");
    const bodyPath = join(outputDir, "coverage-board-missing.txt");
    writeFileSync(bodyPath, `URL: ${page.url()}\n\n${await page.locator("body").innerText()}\n`);
    throw error;
  }
}

async function sendFreshMagicLink() {
  const beforeIds = sparkEmailIds(mailbox);
  const before = beforeIds.length ? Math.max(...beforeIds) : 0;
  const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(account);
  await page.getByRole("button", { name: /Email me a sign-in link/i }).click();
  await page.waitForURL(/sent=1/, { timeout: 30_000 });
  await browser.close();

  const checkedIds = new Set();
  for (let i = 0; i < 36; i += 1) {
    await sleep(5_000);
    const freshIds = sparkEmailIds(mailbox).filter((id) => id > before && !checkedIds.has(id));

    for (const id of freshIds) {
      checkedIds.add(id);
      const magicLink = sparkMagicLinkForRecipient(id, account);
      if (magicLink) return magicLink;
    }
  }

  throw new Error(`No fresh magic-link email found for ${account} newer than Spark ID ${before}.`);
}

async function verifyHelperInviteIfConfigured({
  browser,
  helper,
  helperEmail,
  helperMailbox,
  mailboxBefore
}) {
  if (!process.env.FAMTANDEM_USER_EVAL_HELPER_EMAIL) {
    return;
  }

  const helperMagicLink = await waitForMagicLink({
    expectedRecipient: helperEmail,
    mailboxName: helperMailbox,
    mailboxBefore
  });
  runSummary.helperInviteStatus = "received";

  const helperContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const helperPage = await helperContext.newPage();
  registerPageListeners(helperPage, "helper");
  await helperPage.goto(helperMagicLink, { waitUntil: "networkidle", timeout: 30_000 });
  await helperPage.waitForURL(/\/app/, { timeout: 30_000 });
  await expect(helperPage.getByRole("heading", { name: "Coverage board" })).toBeVisible({
    timeout: 30_000
  });
  await helperPage.goto(`${baseUrl}/app#household-setup`, { waitUntil: "networkidle" });
  await expect(helperPage.getByText(`${helper} · helper`)).toBeVisible({ timeout: 30_000 });
  await expect(helperPage.getByText(helperEmail)).toHaveCount(0);
  await expect(helperPage.getByText("Invite pending")).toHaveCount(0);
  await screenshot(helperPage, "helper-claimed-household");
  await helperContext.close();
  runSummary.helperInviteStatus = "claimed";
}

async function waitForMagicLink({ expectedRecipient, mailboxName, mailboxBefore }) {
  const checkedIds = new Set();
  for (let i = 0; i < 36; i += 1) {
    await sleep(5_000);
    const freshIds = sparkEmailIds(mailboxName).filter((id) => id > mailboxBefore && !checkedIds.has(id));

    for (const id of freshIds) {
      checkedIds.add(id);
      const magicLink = sparkMagicLinkForRecipient(id, expectedRecipient);
      if (magicLink) return magicLink;
    }
  }

  throw new Error(
    `No fresh household invite magic-link email found for ${expectedRecipient} in ${mailboxName}.`
  );
}

function sparkEmailIds(mailboxName) {
  const output = execFileSync(
    "spark",
    [
      "emails",
      mailboxName,
      "--filter",
      `${sparkFromFilter} newer_than:1d`,
      "--page-size",
      "20",
      "--order",
      "descending"
    ],
    { encoding: "utf8" }
  );
  return [...output.matchAll(new RegExp(`\\n\\s*(\\d+)\\s+${escapeRegExp(mailboxName)}\\s+FamTandem`, "g"))].map(
    (match) => Number(match[1])
  );
}

function sparkMagicLinkForRecipient(emailId, expectedRecipient) {
  const text = execFileSync("spark", ["email", String(emailId)], { encoding: "utf8" });
  const recipient = text.match(/(?:^|\n)\s*To:\s*([^\n]+)/i)?.[1]?.trim().toLowerCase();

  if (!recipient || !recipient.includes(expectedRecipient.toLowerCase())) {
    return null;
  }

  const match = text.match(new RegExp(`${escapeRegExp(baseUrl)}/auth/confirm\\?[^\\s)]+`));
  if (!match) {
    throw new Error(`Spark email ${emailId} did not contain a hosted FamTandem magic link.`);
  }
  return match[0];
}

async function addChild(page, name, grade) {
  await page.goto(`${baseUrl}/app#add-logistics`, { waitUntil: "networkidle" });
  const setup = page.locator("#household-setup");
  const childInput = setup.locator('input[placeholder="Child name"]').first();
  if (!(await childInput.isVisible())) {
    await setup.getByText("Add another child", { exact: true }).click();
  }
  const form = setup.locator("form").filter({ hasText: "Save a child profile" }).first();
  await form.getByPlaceholder("Child name").fill(name);
  await form.getByPlaceholder("Age, grade, or group").fill(grade);
  await form.getByRole("button", { name: "Save child" }).click();
  await expect(setup.getByText(name).first()).toBeVisible({ timeout: 30_000 });
}

async function addHelper(page, name, email) {
  await page.goto(`${baseUrl}/app#add-logistics`, { waitUntil: "networkidle" });
  const setup = page.locator("#household-setup");
  const form = setup.locator("form").filter({ hasText: "Add adult or helper" }).first();
  const displayNameInput = form.getByPlaceholder("Display name");
  if (!(await displayNameInput.isVisible())) {
    await setup.locator("summary").filter({ hasText: /Add another person|Add adult or helper/ }).click();
  }
  await displayNameInput.fill(name);
  await form.locator('input[name="email"]').fill(email);
  await form.getByRole("button", { name: "Add and send invite" }).click();
  await expect(setup.getByText(name).first()).toBeVisible({ timeout: 30_000 });
}

async function pasteSource(page, title, text, checks) {
  await page.goto(`${baseUrl}/app#add-logistics`, { waitUntil: "networkidle" });
  const pasteForm = page.locator("#add-logistics");
  await pasteForm.getByLabel("Source title").fill(title);
  await pasteForm.getByLabel("Pasted text").fill(text);
  await pasteForm.getByRole("button", { name: "Read source" }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[0-9a-f-]+/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });

  let body = "";
  for (let i = 0; i < 18; i += 1) {
    body = await page.locator("body").innerText();
    if (body.includes("succeeded") && body.includes("1 / 3") && body.match(/\d+ linked card/)) {
      break;
    }
    await sleep(5_000);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
  }

  assertIncludes(body, "succeeded", `${title} extraction status`);
  assertIncludes(body, "1 / 3", `${title} extraction attempts`);
  assertIncludes(body, "linked card", `${title} linked card count`);
  assertIncludes(body, "gemini", `${title} provider/model`);
  for (const value of checks.mustInclude ?? []) assertIncludes(body, value, title);
  for (const value of checks.mustExclude ?? []) assertExcludes(body, value, title);
  for (const [value, min] of Object.entries(checks.minOccurrences ?? {})) {
    const count = body.split(value).length - 1;
    if (count < min) {
      throw new Error(`${title} expected ${min}+ occurrences of "${value}", saw ${count}.`);
    }
  }
  await screenshot(page, slug(title).slice(0, 48));
}

async function screenshot(page, name) {
  const path = join(outputDir, `${slug(name)}.png`);
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}

function registerPageListeners(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`[${label} console at ${page.url()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(`[${label} pageerror at ${page.url()}] ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (!failure) return;

    const entry = `[${label} requestfailed at ${page.url()}] ${request.method()} ${redactSensitiveUrl(request.url())}: ${failure.errorText}`;

    if (
      isBenignServerActionAbort(request, failure.errorText) ||
      isBenignAnalyticsAbort(request, failure.errorText) ||
      isBenignRscRedirectAbort(request, failure.errorText) ||
      isBenignStaticChunkAbort(request, failure.errorText)
    ) {
      ignoredNetworkEvents.push(entry);
      return;
    }

    browserErrors.push(entry);
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;

    browserErrors.push(
      `[${label} response ${status} at ${page.url()}] ${response.request().method()} ${redactSensitiveUrl(response.url())}`
    );
  });
}

function relevantBrowserErrors() {
  return browserErrors.filter(
    (entry) => !/favicon|Failed to load resource: the server responded with a status of 404/.test(entry)
  );
}

function writeSummary(overrides = {}) {
  const relevantErrors = relevantBrowserErrors();
  const summary = {
    ...runSummary,
    ...overrides,
    screenshots,
    consoleErrors: relevantErrors.filter((entry) => !entry.includes(" requestfailed ") && !entry.includes(" response ")),
    networkErrors: relevantErrors.filter((entry) => entry.includes(" requestfailed ") || entry.includes(" response ")),
    ignoredNetworkEvents
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} missing expected text: ${needle}`);
  }
}

function assertExcludes(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`${label} included forbidden text: ${needle}`);
  }
}

function redactCoverageToken(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/respond/coverage/")) return url;

    parsed.pathname = "/respond/coverage/[redacted-token]";
    if (parsed.searchParams.has("statusProof")) {
      parsed.searchParams.set("statusProof", "[redacted-proof]");
    }
    return parsed.toString();
  } catch {
    return url.replace(/\/respond\/coverage\/[^?]+/, "/respond/coverage/[redacted-token]");
  }
}

function redactSensitiveUrl(url) {
  return redactCoverageToken(url);
}

function isBenignServerActionAbort(request, errorText) {
  if (errorText !== "net::ERR_ABORTED" || request.method() !== "POST") return false;

  try {
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/\/$/, "");
    return url.origin === baseUrl && ["/app", "/household/new"].includes(pathname);
  } catch {
    return false;
  }
}

function isBenignAnalyticsAbort(request, errorText) {
  if (errorText !== "net::ERR_ABORTED" || request.method() !== "POST") return false;

  try {
    const url = new URL(request.url());
    return url.origin === baseUrl && url.pathname === "/ingest/flags/";
  } catch {
    return false;
  }
}

function isBenignRscRedirectAbort(request, errorText) {
  if (errorText !== "net::ERR_ABORTED" || request.method() !== "GET") return false;

  try {
    const url = new URL(request.url());
    return url.origin === baseUrl && url.pathname === "/app" && url.searchParams.has("_rsc");
  } catch {
    return false;
  }
}

function isBenignStaticChunkAbort(request, errorText) {
  if (errorText !== "net::ERR_ABORTED" || request.method() !== "GET") return false;

  try {
    const url = new URL(request.url());
    return url.origin === baseUrl && url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js");
  } catch {
    return false;
  }
}

function assertTool(command, argsForSmoke) {
  try {
    execFileSync(command, argsForSmoke, { stdio: "ignore" });
  } catch {
    throw new Error(`Required CLI is unavailable or not authenticated: ${command}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`Run the guarded hosted FamTandem user evaluation regression suite.

Usage:
  CONFIRM_HOSTED_USER_EVAL=1 npm run test:user-eval:hosted

Safety:
  - Refuses to run unless CONFIRM_HOSTED_USER_EVAL=1 is set.
  - Creates additive timestamped hosted test data only.
  - Never resets, deletes, or truncates hosted data.
  - Uses Spark CLI to read a fresh magic-link email for the test account.

Environment:
  FAMTANDEM_USER_EVAL_EMAIL       Defaults to ${account}
  FAMTANDEM_USER_EVAL_MAILBOX     Defaults to the login email; use for Gmail plus-address tests
  FAMTANDEM_USER_EVAL_BASE_URL    Defaults to ${baseUrl}
  FAMTANDEM_USER_EVAL_STAMP       Defaults to a UTC timestamp
  FAMTANDEM_USER_EVAL_SPARK_FROM  Defaults to ${sparkFromFilter}
  HEADED=1                        Show the browser while running

Artifacts:
  output/playwright/hosted-user-eval/<stamp>/summary.json
  output/playwright/hosted-user-eval/<stamp>/*.png
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

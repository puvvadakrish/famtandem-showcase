import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const haveLocalSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
);

const describeIfLocal = haveLocalSupabase ? describe : describe.skip;

describeIfLocal("local db: mark_coverage_request_sent", () => {
  it("allows only the owning household admin to mark Resend send results", () => {
    expect(() =>
      runLocalSql(`
do $$
declare
  owner_household_id uuid := gen_random_uuid();
  other_household_id uuid := gen_random_uuid();
  owner_admin_user_id uuid := gen_random_uuid();
  owner_helper_user_id uuid := gen_random_uuid();
  other_admin_user_id uuid := gen_random_uuid();
  owner_admin_member_id uuid := gen_random_uuid();
  card_id uuid := gen_random_uuid();
  slot_id uuid := gen_random_uuid();
  token_id uuid := gen_random_uuid();
  token_hash text;
  request_id uuid := gen_random_uuid();
  marked_provider text;
  marked_provider_message_id text;
  marked_attempt_count integer;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values
    (owner_admin_user_id, 'authenticated', 'authenticated', 'owner-admin-' || owner_admin_user_id::text || '@example.test', now(), now()),
    (owner_helper_user_id, 'authenticated', 'authenticated', 'owner-helper-' || owner_helper_user_id::text || '@example.test', now(), now()),
    (other_admin_user_id, 'authenticated', 'authenticated', 'other-admin-' || other_admin_user_id::text || '@example.test', now(), now());

  insert into public.households (id, name, slug, timezone)
  values
    (owner_household_id, 'Send Mark Owner Test', 'send-mark-owner-' || left(owner_household_id::text, 8), 'America/Chicago'),
    (other_household_id, 'Send Mark Other Test', 'send-mark-other-' || left(other_household_id::text, 8), 'America/Chicago');

  insert into public.household_members (id, household_id, user_id, role, display_name, email, active)
  values
    (owner_admin_member_id, owner_household_id, owner_admin_user_id, 'household_admin', 'Owner Admin', 'owner-admin@example.test', true),
    (gen_random_uuid(), owner_household_id, owner_helper_user_id, 'helper', 'Owner Helper', 'owner-helper@example.test', true),
    (gen_random_uuid(), other_household_id, other_admin_user_id, 'household_admin', 'Other Admin', 'other-admin@example.test', true);

  insert into public.coverage_cards (id, household_id, card_type, title, computed_coverage_state, attention_flags, created_by)
  values (card_id, owner_household_id, 'event', 'Resend send mark test', 'needs_coverage', array['needs_coverage'], owner_admin_member_id);

  insert into public.coverage_slots (id, card_id, kind, state)
  values (slot_id, card_id, 'pickup', 'requested');

  token_hash := repeat(replace(token_id::text, '-', ''), 2);

  insert into public.coverage_request_tokens (id, household_id, card_id, token_hash, expires_at, created_by, request_context_snapshot)
  values (token_id, owner_household_id, card_id, token_hash, now() + interval '7 days', owner_admin_member_id, '{}'::jsonb);

  insert into public.coverage_requests (
    id,
    slot_id,
    request_token_id,
    requested_by,
    contact_snapshot,
    channel,
    status,
    provider
  )
  values (
    request_id,
    slot_id,
    token_id,
    owner_admin_member_id,
    '{}'::jsonb,
    'email',
    'pending',
    'local-stub'
  );

  begin
    perform public.mark_coverage_request_sent(token_id, 'resend', 'email-denied-anon', 'sent');
    raise exception 'anon unexpectedly marked coverage request sent';
  exception
    when insufficient_privilege then
      null;
  end;

  perform set_config('request.jwt.claim.sub', owner_helper_user_id::text, true);
  begin
    perform public.mark_coverage_request_sent(token_id, 'resend', 'email-denied-helper', 'sent');
    raise exception 'helper unexpectedly marked coverage request sent';
  exception
    when foreign_key_violation then
      null;
  end;

  perform set_config('request.jwt.claim.sub', other_admin_user_id::text, true);
  begin
    perform public.mark_coverage_request_sent(token_id, 'resend', 'email-denied-cross-household', 'sent');
    raise exception 'cross-household admin unexpectedly marked coverage request sent';
  exception
    when foreign_key_violation then
      null;
  end;

  perform set_config('request.jwt.claim.sub', owner_admin_user_id::text, true);
  perform public.mark_coverage_request_sent(token_id, 'resend', 'email-allowed-1', 'sent');

  select provider, provider_message_id, attempt_count
  into marked_provider, marked_provider_message_id, marked_attempt_count
  from public.coverage_requests
  where id = request_id;

  if marked_provider <> 'resend'
    or marked_provider_message_id <> 'email-allowed-1'
    or marked_attempt_count <> 1
  then
    raise exception 'owning admin did not mark resend sent correctly: provider=%, message=%, attempts=%',
      marked_provider,
      marked_provider_message_id,
      marked_attempt_count;
  end if;

  perform public.mark_coverage_request_sent(token_id, 'resend', null, 'failed');

  select provider, provider_message_id, attempt_count
  into marked_provider, marked_provider_message_id, marked_attempt_count
  from public.coverage_requests
  where id = request_id;

  if marked_provider <> 'resend'
    or marked_provider_message_id is not null
    or marked_attempt_count <> 2
  then
    raise exception 'owning admin did not mark resend failed correctly: provider=%, message=%, attempts=%',
      marked_provider,
      marked_provider_message_id,
      marked_attempt_count;
  end if;

  raise notice 'mark_coverage_request_sent local db assertions passed';
end;
$$;
      `)
    ).not.toThrow();
  });
});

function runLocalSql(sql: string) {
  const dir = mkdtempSync(join(tmpdir(), "famtandem-sql-"));
  const file = join(dir, "query.sql");

  try {
    writeFileSync(file, sql);
    return execFileSync("npx", ["supabase", "db", "query", "--local", "--file", file], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

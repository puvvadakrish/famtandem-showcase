import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const haveLocalSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
);

const describeIfLocal = haveLocalSupabase ? describe : describe.skip;

describeIfLocal("local db: upload text extraction RPCs", () => {
  it("finalizes uploaded artifacts safely and keeps extracted source text private from helpers", () => {
    expect(() =>
      runLocalSql(`
do $$
declare
  v_household_id uuid := gen_random_uuid();
  v_other_household_id uuid := gen_random_uuid();
  v_admin_user_id uuid := gen_random_uuid();
  v_helper_user_id uuid := gen_random_uuid();
  v_other_admin_user_id uuid := gen_random_uuid();
  v_admin_member_id uuid := gen_random_uuid();
  v_helper_member_id uuid := gen_random_uuid();
  v_other_admin_member_id uuid := gen_random_uuid();
  v_source_id uuid := gen_random_uuid();
  v_artifact_id uuid := gen_random_uuid();
  v_no_text_source_id uuid := gen_random_uuid();
  v_no_text_artifact_id uuid := gen_random_uuid();
  v_storage_path text := v_household_id::text || '/' || v_source_id::text || '/notice.txt';
  v_no_text_storage_path text := v_household_id::text || '/' || v_no_text_source_id::text || '/notice.pdf';
  v_artifact_status text;
  v_source_text text;
  v_source_status public.source_input_status;
  v_run_status public.extraction_run_status;
  v_active_jobs integer;
  v_visible_sources integer;
  v_visible_artifacts integer;
  v_visible_objects integer;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values
    (v_admin_user_id, 'authenticated', 'authenticated', 'upload-admin-' || left(v_admin_user_id::text, 8) || '@example.test', now(), now()),
    (v_helper_user_id, 'authenticated', 'authenticated', 'upload-helper-' || left(v_helper_user_id::text, 8) || '@example.test', now(), now()),
    (v_other_admin_user_id, 'authenticated', 'authenticated', 'upload-other-admin-' || left(v_other_admin_user_id::text, 8) || '@example.test', now(), now());

  insert into public.households (id, name, slug, timezone)
  values
    (v_household_id, 'Upload Text Test', 'upload-text-test-' || left(v_household_id::text, 8), 'America/Chicago'),
    (v_other_household_id, 'Other Upload Text Test', 'other-upload-text-test-' || left(v_other_household_id::text, 8), 'America/Chicago');

  insert into public.household_members (id, household_id, user_id, role, display_name, email, active)
  values
    (v_admin_member_id, v_household_id, v_admin_user_id, 'household_admin', 'Upload Admin', 'upload-admin@example.test', true),
    (v_helper_member_id, v_household_id, v_helper_user_id, 'helper', 'Upload Helper', 'upload-helper@example.test', true),
    (v_other_admin_member_id, v_other_household_id, v_other_admin_user_id, 'household_admin', 'Other Admin', 'upload-other-admin@example.test', true);

  insert into public.source_inputs (id, household_id, submitted_by, source_type, raw_subject, normalized_text, status)
  values
    (v_source_id, v_household_id, v_admin_member_id, 'upload', 'Uploaded text notice', null, 'needs_review'),
    (v_no_text_source_id, v_household_id, v_admin_member_id, 'upload', 'Uploaded PDF notice', null, 'needs_review');

  insert into public.source_artifacts (
    id,
    source_input_id,
    household_id,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes,
    text_extraction_status,
    created_by
  )
  values
    (v_artifact_id, v_source_id, v_household_id, v_storage_path, 'notice.txt', 'text/plain', 24, 'not_started', v_admin_member_id),
    (v_no_text_artifact_id, v_no_text_source_id, v_household_id, v_no_text_storage_path, 'notice.pdf', 'application/pdf', 24, 'not_started', v_admin_member_id);

  perform set_config('request.jwt.claim.sub', v_helper_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.finalize_upload_source_artifact(v_source_id, v_artifact_id);
    raise exception 'helper unexpectedly finalized an upload source artifact';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_other_admin_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.finalize_upload_source_artifact(v_source_id, v_artifact_id);
    raise exception 'cross-household admin unexpectedly finalized an upload source artifact';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_admin_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.finalize_upload_source_artifact(v_source_id, v_artifact_id);
    raise exception 'finalize unexpectedly accepted missing storage object';
  exception
    when foreign_key_violation then
      null;
  end;
  execute 'reset role';

  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('source-artifacts', v_storage_path, v_admin_user_id, v_admin_user_id::text, '{}'::jsonb);

  perform set_config('request.jwt.claim.sub', v_admin_user_id::text, true);
  execute 'set local role authenticated';
  perform public.finalize_upload_source_artifact(v_source_id, v_artifact_id);
  perform public.finalize_upload_source_artifact(v_source_id, v_artifact_id);
  execute 'reset role';

  select text_extraction_status
  into v_artifact_status
  from public.source_artifacts
  where id = v_artifact_id;

  if v_artifact_status <> 'pending' then
    raise exception 'finalize did not mark artifact pending: %', v_artifact_status;
  end if;

  select count(*)
  into v_active_jobs
  from public.jobs
  where kind = 'extract_artifact_text'
    and status in ('pending', 'running')
    and payload->>'source_artifact_id' = v_artifact_id::text;

  if v_active_jobs <> 1 then
    raise exception 'finalize left % active artifact text jobs, expected 1', v_active_jobs;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.approve_upload_extracted_text(
      v_source_id,
      v_artifact_id,
      'Premature approval text'
    );
    raise exception 'admin unexpectedly approved upload text before extraction review';
  exception
    when check_violation then
      null;
  end;
  execute 'reset role';

  perform public.record_artifact_text_extraction(
    v_artifact_id,
    'succeeded',
    'Pickup is at 3 PM. Bring cleats.',
    null
  );

  select normalized_text, status
  into v_source_text, v_source_status
  from public.source_inputs
  where id = v_source_id;

  if v_source_text <> 'Pickup is at 3 PM. Bring cleats.' or v_source_status <> 'needs_review' then
    raise exception 'source text/status were not updated correctly: %, %', v_source_text, v_source_status;
  end if;

  select text_extraction_status
  into v_artifact_status
  from public.source_artifacts
  where id = v_artifact_id;

  if v_artifact_status <> 'needs_review' then
    raise exception 'artifact text extraction did not wait for review: %', v_artifact_status;
  end if;

  select status
  into v_run_status
  from public.extraction_runs
  where source_input_id = v_source_id;

  if v_run_status <> 'skipped_no_text' then
    raise exception 'source extraction run did not wait for approval: %', v_run_status;
  end if;

  select count(*)
  into v_active_jobs
  from public.jobs
  where kind = 'extract_source'
    and status in ('pending', 'running')
    and payload->>'source_input_id' = v_source_id::text;

  if v_active_jobs <> 0 then
    raise exception 'record_artifact_text_extraction queued % source jobs before approval', v_active_jobs;
  end if;

  perform set_config('request.jwt.claim.sub', v_helper_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.approve_upload_extracted_text(
      v_source_id,
      v_artifact_id,
      'Helper edit'
    );
    raise exception 'helper unexpectedly approved extracted upload text';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_other_admin_user_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.approve_upload_extracted_text(
      v_source_id,
      v_artifact_id,
      'Other household edit'
    );
    raise exception 'cross-household admin unexpectedly approved extracted upload text';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_admin_user_id::text, true);
  execute 'set local role authenticated';
  perform public.approve_upload_extracted_text(
    v_source_id,
    v_artifact_id,
    'Pickup is at 3:15 PM. Bring cleats.'
  );
  perform public.approve_upload_extracted_text(
    v_source_id,
    v_artifact_id,
    'Pickup is at 3:15 PM. Bring cleats.'
  );
  execute 'reset role';

  select normalized_text, status
  into v_source_text, v_source_status
  from public.source_inputs
  where id = v_source_id;

  if v_source_text <> 'Pickup is at 3:15 PM. Bring cleats.' or v_source_status <> 'pending' then
    raise exception 'approval did not update source text/status correctly: %, %', v_source_text, v_source_status;
  end if;

  select text_extraction_status
  into v_artifact_status
  from public.source_artifacts
  where id = v_artifact_id;

  if v_artifact_status <> 'succeeded' then
    raise exception 'approval did not mark artifact succeeded: %', v_artifact_status;
  end if;

  select status
  into v_run_status
  from public.extraction_runs
  where source_input_id = v_source_id;

  if v_run_status <> 'pending' then
    raise exception 'approval did not reset source extraction run to pending: %', v_run_status;
  end if;

  select count(*)
  into v_active_jobs
  from public.jobs
  where kind = 'extract_source'
    and status in ('pending', 'running')
    and payload->>'source_input_id' = v_source_id::text;

  if v_active_jobs <> 1 then
    raise exception 'approval left % active source jobs, expected 1', v_active_jobs;
  end if;

  perform public.record_artifact_text_extraction(
    v_no_text_artifact_id,
    'not_applicable',
    null,
    'OCR provider is not enabled for this file type.'
  );

  select status
  into v_run_status
  from public.extraction_runs
  where source_input_id = v_no_text_source_id;

  if v_run_status <> 'skipped_no_text' then
    raise exception 'non-text upload extraction run was not terminalized: %', v_run_status;
  end if;

  select count(*)
  into v_active_jobs
  from public.jobs
  where kind = 'extract_source'
    and payload->>'source_input_id' = v_no_text_source_id::text;

  if v_active_jobs <> 0 then
    raise exception 'non-text upload unexpectedly enqueued source extraction jobs: %', v_active_jobs;
  end if;

  perform set_config('request.jwt.claim.sub', v_helper_user_id::text, true);
  execute 'set local role authenticated';
  select count(*) into v_visible_sources from public.source_inputs where id = v_source_id;
  select count(*) into v_visible_artifacts from public.source_artifacts where id = v_artifact_id;
  select count(*) into v_visible_objects from storage.objects where bucket_id = 'source-artifacts' and name = v_storage_path;
  execute 'reset role';

  if v_visible_sources <> 0 or v_visible_artifacts <> 0 or v_visible_objects <> 0 then
    raise exception 'helper saw upload private data: sources=%, artifacts=%, objects=%',
      v_visible_sources,
      v_visible_artifacts,
      v_visible_objects;
  end if;

  raise notice 'upload text extraction local db assertions passed';
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

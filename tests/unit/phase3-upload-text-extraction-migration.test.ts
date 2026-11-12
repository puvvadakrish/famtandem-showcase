import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260526140000_phase3_upload_text_extraction.sql",
  "utf8"
);

describe("upload text extraction migration", () => {
  it("defers upload logistics extraction until artifact text exists", () => {
    expect(migration).toContain("create or replace function public.enqueue_source_input_extraction");
    expect(migration).toContain("NEW.source_type = 'upload'");
    expect(migration).toContain("normalized_text");
    expect(migration).toContain("return NEW;");
  });

  it("adds an authenticated upload-finalized RPC that requires household admin access and an uploaded object", () => {
    expect(migration).toContain("create or replace function public.finalize_upload_source_artifact");
    expect(migration).toContain("set search_path = public");
    expect(migration).not.toContain("set search_path = public, storage");
    expect(migration).toContain("Only household admins can finalize upload source artifacts");
    expect(migration).toContain("from storage.objects");
    expect(migration).toContain("for update of source_artifacts");
    expect(migration).toContain("extract_artifact_text");
    expect(migration).toContain("grant execute on function public.finalize_upload_source_artifact(uuid, uuid) to authenticated");
  });

  it("adds a service-role artifact text recording RPC that queues existing source extraction", () => {
    expect(migration).toContain("create or replace function public.record_artifact_text_extraction");
    expect(migration).toContain("for update");
    expect(migration).toContain("artifact_row.text_extraction_status in ('succeeded', 'needs_review', 'not_applicable')");
    expect(migration).toContain("update public.source_inputs");
    expect(migration).toContain("status = 'skipped_no_text'");
    expect(migration).toContain("insert into public.jobs (kind, payload)");
    expect(migration).toContain("'extract_source'");
    expect(migration).toContain("grant execute on function public.record_artifact_text_extraction(uuid, text, text, text) to service_role");
  });
});

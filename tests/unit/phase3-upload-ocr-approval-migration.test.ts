import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260526170000_phase3_upload_ocr_approval.sql",
  "utf8"
);

describe("upload OCR approval migration", () => {
  it("stores extracted upload text for review without queuing card extraction", () => {
    expect(migration).toContain("create or replace function public.record_artifact_text_extraction");
    expect(migration).toContain("when p_status = 'succeeded' then 'needs_review'");
    expect(migration).toContain("status = 'needs_review'");
    expect(migration).toContain("upload artifact text is awaiting parent review before card creation");
  });

  it("adds a parent/admin approval RPC that queues the existing extraction run", () => {
    expect(migration).toContain("create or replace function public.approve_upload_extracted_text");
    expect(migration).toContain("public.is_household_parent_or_admin(source_row.household_id)");
    expect(migration).toContain("source_row.source_type <> 'upload'");
    expect(migration).toContain("artifact_row.text_extraction_status <> 'needs_review'");
    expect(migration).toContain("upload artifact text is not awaiting approval");
    expect(migration).toContain("text_extraction_status = 'succeeded'");
    expect(migration).toContain("insert into public.jobs (kind, payload)");
    expect(migration).toContain("'extract_source'");
    expect(migration).toContain("payload->>'extraction_run_id' = target_run.id::text");
    expect(migration).toContain("grant execute on function public.approve_upload_extracted_text(uuid, uuid, text) to authenticated");
  });

  it("does not expose approval to anonymous callers or helpers through broad table policies", () => {
    expect(migration).toContain("revoke all on function public.approve_upload_extracted_text(uuid, uuid, text) from anon");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("storage.objects");
  });
});

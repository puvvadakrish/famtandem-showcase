import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260523010000_phase2_upload_source_metadata.sql"),
  "utf8"
);
const objectReadPolicyMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260523020000_phase2_source_artifact_object_read_policy.sql"
  ),
  "utf8"
);
const objectInsertPolicyMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260524093100_phase2_source_artifact_insert_policy_hardening.sql"
  ),
  "utf8"
);
const objectDeletePolicyMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260526150000_phase3_source_artifact_object_delete_policy.sql"
  ),
  "utf8"
);

describe("phase 2 upload source metadata migration", () => {
  it("creates source artifact metadata with private-storage limits", () => {
    expect(migration).toContain("create table public.source_artifacts");
    expect(migration).toContain("storage_bucket text not null default 'source-artifacts'");
    expect(migration).toContain("source_artifacts_file_size_check");
    expect(migration).toContain("file_size_bytes <= 10485760");
    expect(migration).toContain("source_artifacts_mime_type_check");
    expect(migration).toContain("'application/pdf'");
    expect(migration).toContain("'image/png'");
    expect(migration).toContain("create unique index source_artifacts_storage_path_unique_idx");
  });

  it("keeps artifact rows scoped to the same household and source input", () => {
    expect(migration).toContain("create or replace function public.validate_source_artifact_household_refs");
    expect(migration).toContain("source_input_id must belong to the same household");
    expect(migration).toContain("storage_path must be scoped to household/source input");
    expect(migration).toContain("create trigger source_artifacts_validate_household_refs");
    expect(migration).toContain("revoke all on function public.validate_source_artifact_household_refs() from authenticated");
  });

  it("limits artifact metadata and object uploads to the intended access boundary", () => {
    expect(migration).toContain('create policy "parents and household admins can read source artifacts"');
    expect(migration).toContain("household_members.role in ('parent', 'household_admin')");
    expect(migration).toContain('create policy "household admins can manage upload source artifacts"');
    expect(migration).toContain('create policy "household admins can upload source artifact objects"');
    expect(migration).toContain("bucket_id = 'source-artifacts'");
  });

  it("tightens raw storage object reads to parents, household admins, and internal admins", () => {
    expect(objectReadPolicyMigration).toContain(
      'drop policy if exists "members can read their source artifact objects" on storage.objects'
    );
    expect(objectReadPolicyMigration).toContain(
      'drop policy if exists "parents and household admins can read source artifact objects" on storage.objects'
    );
    expect(objectReadPolicyMigration).toContain(
      'create policy "parents and household admins can read source artifact objects"'
    );
    expect(objectReadPolicyMigration).toContain("on storage.objects for select");
    expect(objectReadPolicyMigration).toContain("to authenticated");
    expect(objectReadPolicyMigration).toContain("bucket_id = 'source-artifacts'");
    expect(objectReadPolicyMigration).toContain("public.is_internal_admin()");
    expect(objectReadPolicyMigration).toContain("household_members.role in ('parent', 'household_admin')");
    expect(objectReadPolicyMigration).not.toContain("public.is_household_member");
  });

  it("requires direct upload objects to match precreated source artifact metadata", () => {
    expect(objectInsertPolicyMigration).toContain(
      'drop policy if exists "household admins can upload source artifact objects" on storage.objects'
    );
    expect(objectInsertPolicyMigration).toContain(
      'create policy "household admins can upload source artifact objects"'
    );
    expect(objectInsertPolicyMigration).toContain("on storage.objects for insert");
    expect(objectInsertPolicyMigration).toContain("to authenticated");
    expect(objectInsertPolicyMigration).toContain("bucket_id = 'source-artifacts'");
    expect(objectInsertPolicyMigration).toContain("from public.source_artifacts");
    expect(objectInsertPolicyMigration).toContain("join public.source_inputs");
    expect(objectInsertPolicyMigration).toContain("source_inputs.source_type = 'upload'");
    expect(objectInsertPolicyMigration).toContain(
      "source_artifacts.storage_path = storage.objects.name"
    );
    expect(objectInsertPolicyMigration).toContain(
      "public.is_household_admin(source_artifacts.household_id)"
    );
    expect(objectInsertPolicyMigration).not.toContain("split_part(storage.objects.name");
  });

  it("allows household admins to delete only unfinalized source artifact objects for cleanup", () => {
    expect(objectDeletePolicyMigration).toContain(
      'create policy "household admins can delete unfinalized source artifact objects"'
    );
    expect(objectDeletePolicyMigration).toContain("on storage.objects for delete");
    expect(objectDeletePolicyMigration).toContain("to authenticated");
    expect(objectDeletePolicyMigration).toContain("bucket_id = 'source-artifacts'");
    expect(objectDeletePolicyMigration).toContain("source_artifacts.storage_path = storage.objects.name");
    expect(objectDeletePolicyMigration).toContain("source_artifacts.finalized_at is null");
    expect(objectDeletePolicyMigration).toContain("public.is_household_admin(source_artifacts.household_id)");
  });

  it("creates upload source metadata through one authenticated RPC without extraction jobs", () => {
    expect(migration).toContain("create or replace function public.create_upload_source_metadata");
    expect(migration).toContain("returns table(source_input_id uuid, source_artifact_id uuid, storage_path text)");
    expect(migration).toContain("role = 'household_admin'");
    expect(migration).toContain("'upload'");
    expect(migration).toContain("'needs_review'");
    expect(migration).toContain("'not_started'");
    expect(migration).toContain("grant execute on function public.create_upload_source_metadata");
    expect(migration).not.toContain("gemini");
    expect(migration).not.toContain("extraction_runs");
  });
});

create table public.source_artifacts (
  id uuid primary key default gen_random_uuid(),
  source_input_id uuid not null references public.source_inputs(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  storage_bucket text not null default 'source-artifacts',
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  checksum_sha256 text,
  text_extraction_status text not null default 'not_started',
  created_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_artifacts_bucket_check check (storage_bucket = 'source-artifacts'),
  constraint source_artifacts_file_size_check check (
    file_size_bytes > 0
    and file_size_bytes <= 10485760
  ),
  constraint source_artifacts_mime_type_check check (
    mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain'
    )
  ),
  constraint source_artifacts_text_extraction_status_check check (
    text_extraction_status in (
      'not_started',
      'pending',
      'processing',
      'succeeded',
      'failed',
      'needs_review',
      'not_applicable'
    )
  )
);

create index source_artifacts_source_input_id_idx on public.source_artifacts(source_input_id);
create index source_artifacts_household_id_idx on public.source_artifacts(household_id);
create unique index source_artifacts_storage_path_unique_idx
on public.source_artifacts(storage_bucket, storage_path);

create or replace function public.validate_source_artifact_household_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_household_id uuid;
begin
  select household_id
  into source_household_id
  from public.source_inputs
  where id = NEW.source_input_id;

  if source_household_id is null then
    raise exception 'source_input_id must reference an existing source input'
      using errcode = '23503';
  end if;

  if source_household_id <> NEW.household_id then
    raise exception 'source_input_id must belong to the same household'
      using errcode = '23514';
  end if;

  perform public.assert_household_member_reference(NEW.created_by, NEW.household_id, 'created_by');

  if NEW.storage_path !~ (
    '^' || NEW.household_id::text || '/' || NEW.source_input_id::text || '/[^/]+$'
  ) then
    raise exception 'storage_path must be scoped to household/source input'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

create trigger source_artifacts_validate_household_refs
before insert or update on public.source_artifacts
for each row execute function public.validate_source_artifact_household_refs();

revoke all on function public.validate_source_artifact_household_refs() from public;
revoke all on function public.validate_source_artifact_household_refs() from anon;
revoke all on function public.validate_source_artifact_household_refs() from authenticated;

alter table public.source_artifacts enable row level security;

create policy "parents and household admins can read source artifacts"
on public.source_artifacts for select
using (
  public.is_internal_admin()
  or exists (
    select 1
    from public.household_members
    where household_members.household_id = source_artifacts.household_id
      and household_members.user_id = auth.uid()
      and household_members.role in ('parent', 'household_admin')
      and household_members.active = true
  )
);

create policy "household admins can manage upload source artifacts"
on public.source_artifacts for all
to authenticated
using (public.is_household_admin(household_id) or public.is_internal_admin())
with check (public.is_household_admin(household_id) or public.is_internal_admin());

create policy "household admins can upload source artifact objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'source-artifacts'
  and exists (
    select 1
    from public.households
    where households.id::text = split_part(storage.objects.name, '/', 1)
      and public.is_household_admin(households.id)
  )
);

create or replace function public.create_upload_source_metadata(
  p_raw_subject text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_storage_path text default null,
  p_checksum_sha256 text default null
)
returns table(source_input_id uuid, source_artifact_id uuid, storage_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member record;
  created_source_input_id uuid;
  created_source_artifact_id uuid;
  normalized_original_file_name text := nullif(trim(coalesce(p_original_file_name, '')), '');
  normalized_raw_subject text := nullif(trim(coalesce(p_raw_subject, '')), '');
  normalized_mime_type text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  normalized_checksum text := lower(nullif(trim(coalesce(p_checksum_sha256, '')), ''));
  sanitized_file_name text;
  resolved_storage_path text;
begin
  if auth.uid() is null then
    raise exception 'create_upload_source_metadata requires authentication'
      using errcode = '42501';
  end if;

  if normalized_original_file_name is null then
    raise exception 'original file name is required'
      using errcode = '23502';
  end if;

  if normalized_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ) then
    raise exception 'unsupported upload mime type'
      using errcode = '23514';
  end if;

  if p_file_size_bytes is null
    or p_file_size_bytes <= 0
    or p_file_size_bytes > 10485760
  then
    raise exception 'upload file size must be between 1 byte and 10 MB'
      using errcode = '23514';
  end if;

  if normalized_checksum is not null and normalized_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'checksum_sha256 must be a lowercase hex sha256 digest'
      using errcode = '23514';
  end if;

  select id, household_id
  into current_member
  from public.household_members
  where user_id = auth.uid()
    and role = 'household_admin'
    and active = true
  order by created_at
  limit 1;

  if current_member.id is null then
    raise exception 'Only household admins can create upload source metadata'
      using errcode = '42501';
  end if;

  insert into public.source_inputs (
    household_id,
    submitted_by,
    source_type,
    raw_subject,
    normalized_text,
    status
  )
  values (
    current_member.household_id,
    current_member.id,
    'upload',
    coalesce(normalized_raw_subject, normalized_original_file_name),
    null,
    'needs_review'
  )
  returning id into created_source_input_id;

  sanitized_file_name := regexp_replace(
    lower(normalized_original_file_name),
    '[^a-z0-9._-]+',
    '-',
    'g'
  );
  sanitized_file_name := trim(both '-' from coalesce(nullif(sanitized_file_name, ''), 'upload'));

  resolved_storage_path := nullif(trim(coalesce(p_storage_path, '')), '');
  if resolved_storage_path is null then
    resolved_storage_path :=
      current_member.household_id::text || '/' ||
      created_source_input_id::text || '/' ||
      gen_random_uuid()::text || '-' ||
      sanitized_file_name;
  end if;

  insert into public.source_artifacts (
    source_input_id,
    household_id,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes,
    checksum_sha256,
    text_extraction_status,
    created_by
  )
  values (
    created_source_input_id,
    current_member.household_id,
    resolved_storage_path,
    normalized_original_file_name,
    normalized_mime_type,
    p_file_size_bytes,
    normalized_checksum,
    'not_started',
    current_member.id
  )
  returning id into created_source_artifact_id;

  return query select created_source_input_id, created_source_artifact_id, resolved_storage_path;
end;
$$;

revoke all on function public.create_upload_source_metadata(
  text,
  text,
  text,
  bigint,
  text,
  text
) from public;
revoke all on function public.create_upload_source_metadata(
  text,
  text,
  text,
  bigint,
  text,
  text
) from anon;
grant execute on function public.create_upload_source_metadata(
  text,
  text,
  text,
  bigint,
  text,
  text
) to authenticated;

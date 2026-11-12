drop policy if exists "household admins can upload source artifact objects" on storage.objects;

create policy "household admins can upload source artifact objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'source-artifacts'
  and exists (
    select 1
    from public.source_artifacts
    join public.source_inputs
      on source_inputs.id = source_artifacts.source_input_id
     and source_inputs.household_id = source_artifacts.household_id
     and source_inputs.source_type = 'upload'
    where source_artifacts.storage_bucket = 'source-artifacts'
      and source_artifacts.storage_path = storage.objects.name
      and public.is_household_admin(source_artifacts.household_id)
  )
);

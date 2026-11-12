drop policy if exists "members can read their source artifact objects" on storage.objects;
drop policy if exists "parents and household admins can read source artifact objects" on storage.objects;

create policy "parents and household admins can read source artifact objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'source-artifacts'
  and (
    public.is_internal_admin()
    or exists (
      select 1
      from public.households
      join public.household_members
        on household_members.household_id = households.id
       and household_members.user_id = auth.uid()
       and household_members.role in ('parent', 'household_admin')
       and household_members.active = true
      where households.id::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

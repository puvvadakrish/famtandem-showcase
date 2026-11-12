create index if not exists household_members_active_email_unclaimed_idx
on public.household_members (lower(email))
where active = true
  and email is not null
  and user_id is null;

create or replace function public.claim_household_member_by_email()
returns table (
  claimed boolean,
  member_id uuid,
  household_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  signed_in_user_id uuid := auth.uid();
  signed_in_email text := lower(nullif(trim(auth.jwt() ->> 'email'), ''));
  signed_in_email_confirmed_at timestamptz;
  matching_count integer;
  target_member_id uuid;
  target_household_id uuid;
begin
  if signed_in_user_id is null then
    return query select false, null::uuid, null::uuid, 'not_authenticated';
    return;
  end if;

  select lower(nullif(trim(email), '')),
    email_confirmed_at
  into signed_in_email,
    signed_in_email_confirmed_at
  from auth.users
  where id = signed_in_user_id;

  if signed_in_email is null then
    return query select false, null::uuid, null::uuid, 'missing_email';
    return;
  end if;

  if signed_in_email_confirmed_at is null then
    return query select false, null::uuid, null::uuid, 'unverified_email';
    return;
  end if;

  if exists (
    select 1
    from public.household_members
    where user_id = signed_in_user_id
      and active = true
  ) then
    return query select false, null::uuid, null::uuid, 'already_member';
    return;
  end if;

  select count(*)
  into matching_count
  from public.household_members
  where lower(email) = signed_in_email
    and active = true
    and user_id is null;

  if matching_count = 0 then
    return query select false, null::uuid, null::uuid, 'no_match';
    return;
  end if;

  if matching_count > 1 then
    return query select false, null::uuid, null::uuid, 'ambiguous_match';
    return;
  end if;

  select id
  into target_member_id
  from public.household_members
  where lower(email) = signed_in_email
    and active = true
    and user_id is null
  limit 1;

  update public.household_members matched_member
  set user_id = signed_in_user_id,
    email = signed_in_email,
    updated_at = now()
  where id = target_member_id
    and active = true
    and user_id is null
  returning matched_member.id, matched_member.household_id
  into target_member_id, target_household_id;

  if target_member_id is null then
    return query select false, null::uuid, null::uuid, 'claim_race_lost';
    return;
  end if;

  return query select true, target_member_id, target_household_id, 'claimed';
end;
$$;

revoke all on function public.claim_household_member_by_email() from public;
grant execute on function public.claim_household_member_by_email() to authenticated;

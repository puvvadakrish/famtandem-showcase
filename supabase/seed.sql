insert into public.households (id, name, slug, timezone, cohort_label)
values (
  '00000000-0000-4000-8000-000000000001',
  'Rivera family',
  'rivera-family',
  'America/Chicago',
  'local_seed'
)
on conflict (id) do nothing;

insert into public.jobs (id, kind, payload, status, run_after)
values (
  '00000000-0000-4000-8000-000000000101',
  'noop',
  '{"seed": true}'::jsonb,
  'pending',
  now()
)
on conflict (id) do nothing;

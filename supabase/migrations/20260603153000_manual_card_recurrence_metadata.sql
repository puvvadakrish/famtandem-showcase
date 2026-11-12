alter table public.coverage_cards
add column if not exists recurrence_group_id uuid,
add column if not exists recurrence_index integer,
add column if not exists recurrence_label text;

create index if not exists coverage_cards_recurrence_group_id_idx
on public.coverage_cards(recurrence_group_id)
where recurrence_group_id is not null;

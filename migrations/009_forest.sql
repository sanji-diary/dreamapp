-- The shared forest on the children's "우리 숲" screen. One row per Sunday, written the first time
-- that week's forest is looked at: gained = 1 (every Sunday) + bonus (1 or 2 more when the children
-- did many missions together the week before). Rows are never changed afterwards, so the forest
-- never shrinks. The earliest row is the week the forest started; emptying the table starts a new one.
create table forest_weeks (
  week_start date primary key,
  gained smallint not null check (gained between 1 and 3),
  bonus smallint not null default 0 check (bonus between 0 and 2),
  created_at timestamptz not null default now()
);

alter table forest_weeks enable row level security;

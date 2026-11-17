-- The mission plan: fixed, rotating and dated missions, verses in several parts, and the
-- welcome-back drops. Additive only: every existing mission keeps working as a 'dated' one,
-- and no mission is created here (production data is not known to this file).

-- mode: how a mission is scheduled.
--   dated: between starts_on and ends_on (what every mission was until now)
--   fixed: on every week, whatever the dates say
--   pool:  a rotating mission, on only in the weeks whose rotation plan lists it
-- pool_order: the admin's order of the rotating missions (smaller first).
-- verses: [{"n":"16","text":"..."}] for a 'verse' mission; null means the old single verse_text.
alter table missions add column mode text not null default 'dated' check (mode in ('dated','fixed','pool'));
alter table missions add column pool_order int not null default 0;
alter table missions add column verses jsonb;

-- Which rotating missions are on in a week. One row per week, written the first time the week is
-- looked at (manual = false) or by an admin (manual = true). A past week without a row had none.
create table rotation_weeks (
  week_start date primary key,
  mission_ids int[] not null default '{}',
  manual boolean not null default false,
  updated_by int references staff(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- What a fixed 'verse' mission ("이번 주 말씀 쓰기") asks for in a given week, so the verses can be
-- entered weeks ahead. verses has the same shape as missions.verses.
create table mission_weeks (
  mission_id int not null references missions(id) on delete cascade,
  week_start date not null,
  verse_ref text,
  verses jsonb not null,
  updated_by int references staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (mission_id, week_start)
);

-- How far a child has come in a verse mission with several verses. period: the week's Sunday for
-- a weekly mission, the day for a daily one, 'once' for a one-time mission. done_key is a
-- fingerprint of the verses already written, so the count starts over if those verses are changed.
create table verse_progress (
  child_id int not null references children(id) on delete cascade,
  mission_id int not null references missions(id) on delete cascade,
  period text not null,
  done int not null default 0,
  done_key text not null default '',
  updated_at timestamptz not null default now(),
  primary key (child_id, mission_id, period)
);

-- How many rotating missions are picked for a week when nobody chooses them by hand.
insert into settings (key, value) values ('rotating_per_week', '3') on conflict (key) do nothing;

-- Welcome-back drops are written to drop_ledger with ref_type 'welcome' and week_start = the Sunday
-- they belong to. ref_type has no check constraint, so nothing has to change for that; only rows
-- with ref_type 'mission' count toward the weekly cap.
create index drop_ledger_welcome on drop_ledger (child_id, week_start) where ref_type = 'welcome';

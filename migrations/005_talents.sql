-- 달란트 잔치: near year end the points are converted to talents at a rate the pastor chooses,
-- and children spend the talents at stalls. Points themselves are never deducted.
-- Only new tables; nothing existing is changed.
create table talent_events (
  id serial primary key,
  name text not null,
  points_per_talent int not null check (points_per_talent > 0),
  status text not null default 'draft' check (status in ('draft','open','closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_by int references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
-- At most one event may be open at a time.
create unique index talent_events_one_open on talent_events (status) where status = 'open';

-- Snapshot taken when the event opens. Later point changes do not alter it.
create table talent_grants (
  event_id int not null references talent_events(id) on delete cascade,
  child_id int not null references children(id) on delete cascade,
  points_at_open int not null,
  talents int not null check (talents >= 0),
  primary key (event_id, child_id)
);

-- Append-only. A child's balance for an event = grant + sum(delta).
-- kind: payment (negative), undo (cancels one payment, see undo_of), adjust (manual, by an admin).
create table talent_ledger (
  id serial primary key,
  event_id int not null references talent_events(id) on delete cascade,
  child_id int not null references children(id) on delete cascade,
  delta int not null check (delta <> 0),
  kind text not null check (kind in ('payment','undo','adjust')),
  reason text not null,
  undo_of int references talent_ledger(id),
  staff_id int references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index talent_ledger_event_child on talent_ledger (event_id, child_id);
create index talent_ledger_event_staff on talent_ledger (event_id, staff_id);
-- A payment can be cancelled only once.
create unique index talent_ledger_one_undo on talent_ledger (undo_of) where undo_of is not null;

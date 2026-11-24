-- 〈달걀 홀인원〉 (games/egg-hole-in-one): a mission game for one child that this app serves itself,
-- so the app is also its game server. Additive only: safe to apply on the live database.
--
-- egg_rounds: one row per game started. The phone holds the ticket (`token`, kept here only as its
-- SHA-256); a finished game is accepted only with that ticket and only after the shots sent with it
-- have been played through again by the server. `launch_id` ties the round to a child's launch
-- (game_launches) when the game was opened from a mission; it is null for a game opened by its own
-- address, which can never be paid. `result_id` is written once, when the round is finished.
-- A round can be finished for a day after it starts; a finished round is kept for 90 days.
create table egg_rounds (
  seq serial primary key,
  round_id text not null unique,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  launch_id text check (launch_id ~ '^[0-9a-f]{64}$'),
  rules_version smallint not null default 2,
  expires_at timestamptz not null,
  result_id text unique,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index egg_rounds_launch on egg_rounds (launch_id, seq);
create index egg_rounds_expiry on egg_rounds (expires_at);

alter table egg_rounds enable row level security;

-- Mission games that run on their own game server and are shown inside the app (see src/games/registry.ts,
-- host = 'hosted'). Additive only: safe to apply on the live database.
--
-- game_launches: one row per child, mission and week. The app keeps `secret_hex` to itself and gives the
-- browser only `launch_id` (the SHA-256 of the secret). The game server records a finished game under the
-- launch id; only someone holding the secret (this app's server) can ask it whether that launch won.
-- opened_at: the last time the child was in the game. checked_at: the last time the game server answered
-- for this launch. A launch not asked about since shortly after the child was last there is looked at
-- again on the child's next visit, which is how a win is found when the app was closed straight after it.
create table game_launches (
  launch_id text primary key check (launch_id ~ '^[0-9a-f]{64}$'),
  child_id int not null references children(id) on delete cascade,
  mission_id int not null references missions(id) on delete cascade,
  game_id text not null,
  secret_hex text not null check (secret_hex ~ '^[0-9a-f]{64}$'),
  week_start date not null,
  created_at timestamptz not null default now(),
  opened_at timestamptz not null default now(),
  checked_at timestamptz,
  unique (child_id, mission_id, game_id, week_start)
);
create index game_launches_child on game_launches (child_id, created_at);

-- game_results: every finished game the game server has confirmed for a child, written once.
-- The row and the mission completion it leads to are saved in one transaction; `completion_id` is null
-- when the game was really won but the mission had nothing left to give (already done that week).
-- The two unique rules are what stop a second payment: the same result twice, or the same child
-- holding two seats of one round.
create table game_results (
  id serial primary key,
  game_id text not null,
  result_id text not null,
  round_id text not null,
  child_id int not null references children(id) on delete cascade,
  mission_id int not null references missions(id) on delete cascade,
  launch_id text not null references game_launches(launch_id) on delete cascade,
  completed_at timestamptz not null,
  completion_id int references mission_completions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (game_id, result_id),
  unique (child_id, game_id, round_id)
);
create index game_results_launch on game_results (launch_id);

alter table game_launches enable row level security;
alter table game_results enable row level security;

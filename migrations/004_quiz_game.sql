-- Quiz and game missions. Additive only: safe to apply on the live database.
-- quiz: [{"q":"질문","choices":["보기1","보기2"],"answer":0}] (1-10 questions, 2-4 choices, answer = index of the right choice)
-- quiz_pass: how many must be right to finish the mission; null means all of them.
-- game_id: which mini game from src/games/registry.ts a 'game' mission plays.
alter table missions add column quiz jsonb;
alter table missions add column quiz_pass int;
alter table missions add column game_id text;

-- One row per try at a quiz. The answers a child gives are recorded here by the server,
-- one at a time, and the score is worked out from this row (never from what the browser reports).
create table quiz_attempts (
  id serial primary key,
  child_id int not null references children(id) on delete cascade,
  mission_id int not null references missions(id) on delete cascade,
  answers jsonb not null default '[]',
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index quiz_attempts_child_mission on quiz_attempts (child_id, mission_id);

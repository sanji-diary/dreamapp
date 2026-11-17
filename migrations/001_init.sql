-- 꿈의숲키우기: initial schema
-- All access goes through the Next.js server (src/lib). Browsers never query the database directly.

create table classes (
  id serial primary key,
  name text not null,
  grade int,
  year int not null default 2027,
  sort int not null default 0,
  archived boolean not null default false
);

-- Teachers and admins. role: basic (비담임) / homeroom (담임) / head (부장) / admin (교역자)
create table staff (
  id serial primary key,
  name text not null,
  kakao_id text unique,
  role text not null default 'basic' check (role in ('basic','homeroom','head','admin')),
  can_attendance boolean not null default false,
  can_visits boolean not null default false,
  can_approve boolean not null default false,
  can_view_all boolean not null default false,
  can_read_pastor_worries boolean not null default false,
  invite_code text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff_classes (
  staff_id int not null references staff(id) on delete cascade,
  class_id int not null references classes(id) on delete cascade,
  primary key (staff_id, class_id)
);

create table children (
  id serial primary key,
  name text not null,
  class_id int references classes(id) on delete set null,
  birth_date date,
  gender text check (gender in ('M','F')),
  school text,
  school_class text,
  address text,
  phone text,
  guardian_phone text,
  photo_url text,
  best_friend_id int references children(id) on delete set null,
  best_friend_name text,
  has_phone boolean not null default true,
  qr_token text not null unique,
  pin_hash text,
  pin_fail_count int not null default 0,
  pin_locked_until timestamptz,
  onboarded_at timestamptz,
  consent_on date,
  photo_consent boolean not null default false,
  memo text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per tree a child has grown. The current tree is the one with harvested_at is null.
create table trees (
  id serial primary key,
  child_id int not null references children(id) on delete cascade,
  seq int not null default 1,
  species text not null default 'persimmon',
  level int not null default 1 check (level between 1 and 6),
  given int not null default 0,
  planted_at timestamptz not null default now(),
  harvested_at timestamptz
);
create unique index trees_one_active on trees (child_id) where harvested_at is null;

-- kind: how a mission is verified
create table missions (
  id serial primary key,
  title text not null,
  description text not null default '',
  kind text not null check (kind in ('self','text','photo','verse','quiz','game','qr','teacher','worry','comment','attendance')),
  icon text not null default 'stamp',
  verse_text text,
  verse_ref text,
  qr_code text unique,
  points int not null default 0,
  drops int not null default 1,
  repeat text not null default 'once' check (repeat in ('once','daily','weekly')),
  weekly_limit int,
  target_grade int,
  target_class_id int references classes(id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  is_challenge boolean not null default false,
  active boolean not null default true,
  created_by int references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create table mission_completions (
  id serial primary key,
  mission_id int not null references missions(id) on delete cascade,
  child_id int not null references children(id) on delete cascade,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  text_content text,
  photo_url text,
  done_on date not null,
  week_start date not null,
  drops_awarded int not null default 0,
  points_awarded int not null default 0,
  entered_by_staff_id int references staff(id) on delete set null,
  reviewed_by int references staff(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index mission_completions_child_week on mission_completions (child_id, week_start);

-- Append-only ledgers. Balance = sum(delta). Corrections are new rows, never updates.
create table drop_ledger (
  id serial primary key,
  child_id int not null references children(id) on delete cascade,
  delta int not null,
  reason text not null,
  ref_type text,
  ref_id int,
  week_start date,
  staff_id int references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index drop_ledger_child on drop_ledger (child_id);

create table point_ledger (
  id serial primary key,
  child_id int not null references children(id) on delete cascade,
  delta int not null,
  reason text not null,
  ref_type text,
  ref_id int,
  staff_id int references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index point_ledger_child on point_ledger (child_id);

create table attendance (
  id serial primary key,
  child_id int not null references children(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','late','absent')),
  note text,
  staff_id int references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (child_id, date)
);

create table visits (
  id serial primary key,
  child_id int not null references children(id) on delete cascade,
  visited_on date not null,
  method text not null check (method in ('in_person','phone','message')),
  content text not null,
  staff_id int references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- audience is chosen by the child for each worry: teacher / pastor / both.
-- class_id_at_write freezes which homeroom teachers may read it.
create table worries (
  id serial primary key,
  child_id int not null references children(id) on delete cascade,
  content text not null,
  audience text not null check (audience in ('teacher','pastor','both')),
  class_id_at_write int references classes(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table worry_replies (
  id serial primary key,
  worry_id int not null references worries(id) on delete cascade,
  staff_id int references staff(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  read_by_child_at timestamptz
);

create table worry_reads (
  id serial primary key,
  worry_id int not null references worries(id) on delete cascade,
  staff_id int not null references staff(id) on delete cascade,
  read_at timestamptz not null default now()
);

create table posts (
  id serial primary key,
  body text not null,
  image_url text,
  staff_id int references staff(id) on delete set null,
  comments_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table post_likes (
  post_id int not null references posts(id) on delete cascade,
  child_id int not null references children(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, child_id)
);

create table comments (
  id serial primary key,
  post_id int not null references posts(id) on delete cascade,
  child_id int references children(id) on delete cascade,
  staff_id int references staff(id) on delete set null,
  body text not null,
  hidden_at timestamptz,
  hidden_by int references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create table comment_reports (
  id serial primary key,
  comment_id int not null references comments(id) on delete cascade,
  child_id int not null references children(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (comment_id, child_id)
);

create table notices (
  id serial primary key,
  title text not null,
  body text not null default '',
  important boolean not null default false,
  staff_only boolean not null default false,
  event_date date,
  staff_id int references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

-- items: [{"title":"찬양","detail":"..."}]
create table worship (
  id serial primary key,
  date date not null unique,
  time_place text not null default '',
  sermon_title text not null default '',
  scripture text not null default '',
  preacher text not null default '',
  memory_verse text not null default '',
  items jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table badges (
  child_id int not null references children(id) on delete cascade,
  code text not null,
  earned_at timestamptz not null default now(),
  primary key (child_id, code)
);

create table audit_log (
  id serial primary key,
  staff_id int references staff(id) on delete set null,
  action text not null,
  target_type text,
  target_id int,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null
);

insert into settings (key, value) values
  ('weekly_drop_cap', '12'),
  ('level_needs', '[2,4,6,8,10,10]'),
  ('class_goal', '30'),
  ('harvest_bonus_points', '50'),
  ('welcome_back_drops', '2');

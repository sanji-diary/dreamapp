-- Photos (mission proof, profile pictures, feed images) are kept in the database and served
-- through /api/photo/[id] after a sign-in check. Images are shrunk in the browser before upload.
create table uploads (
  id serial primary key,
  purpose text not null check (purpose in ('mission','profile','post')),
  child_id int references children(id) on delete cascade,
  staff_id int references staff(id) on delete set null,
  mime text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

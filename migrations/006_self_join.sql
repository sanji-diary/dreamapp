-- Children may register themselves by scanning one shared QR (/start/<code>).
-- The shared code itself ('join_code' in settings) is made by the app the first time it is needed,
-- so it comes from the same secure random source as the QR card tokens.
alter table children add column self_joined boolean not null default false;
create index children_self_joined_at on children (created_at) where self_joined;

insert into settings (key, value) values ('self_join_on', 'true') on conflict (key) do nothing;

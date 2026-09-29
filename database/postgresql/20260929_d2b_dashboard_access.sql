begin;
set local lock_timeout = '5s';
do $$
declare initialize boolean := to_regclass('agent_portal.d2b_dashboard_access') is null;
begin
create table if not exists agent_portal.d2b_dashboard_access (
 id bigint generated always as identity primary key,
 display_name text not null check(length(trim(display_name)) between 1 and 100),
 email text not null unique check(email=lower(trim(email)) and length(email) between 3 and 254),
 is_active boolean not null default true,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
-- Seed only on first creation; later edits/deletions must survive reruns.
if initialize then
insert into agent_portal.d2b_dashboard_access(display_name,email) values
 ('Kim, Shari','shari.kim@changshininc.com'),
 ('Kim, Naomi','naomi.kim@changshininc.com') on conflict(email) do nothing;
end if;
end $$;
commit;

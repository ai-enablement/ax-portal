begin;
set local lock_timeout = '5s';
alter table agent_portal.users add column if not exists shared_account_id bigint references agent_portal.users(id) on delete restrict;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='agent_portal.users'::regclass and conname='users_shared_account_check') then
  alter table agent_portal.users add constraint users_shared_account_check check(shared_account_id is null or (shared_account_id<>id and email is null and ms_account_id is null and app_role in ('bts','bp_solution')));
 end if;
end $$;
create index if not exists users_shared_account_idx on agent_portal.users(shared_account_id) where shared_account_id is not null;
commit;

-- Run as the function owner in the production portal database.
-- Changes function configuration only; preserves project rows and privileges.
begin;
alter function agent_portal.next_project_code(integer)
  set search_path = pg_catalog, agent_portal, pg_temp;
alter function agent_portal.change_project_stage(bigint, text, bigint, text)
  set search_path = pg_catalog, agent_portal, pg_temp;
commit;

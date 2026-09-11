-- Allow a non-numbered INT draft. Existing project numbers are preserved.
begin;
alter table agent_portal.projects drop constraint if exists projects_project_code_check;
alter table agent_portal.projects add constraint projects_project_code_check
 check (project_code ~ '^[0-9]{4}-[0-9]{3,}$' or project_code ~ '^DRAFT-[a-f0-9]{32}$');
commit;

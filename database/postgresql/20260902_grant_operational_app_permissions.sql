-- Operational least-privilege grants for the Azure App Service database role.
-- Run once as the owner of hyebin_db / agent_portal after the schema migrations.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ax_projects_app') then
    raise exception 'Database role ax_projects_app does not exist';
  end if;
  execute format('grant connect on database %I to ax_projects_app', current_database());
end
$$;

grant usage on schema agent_portal to ax_projects_app;

grant select, insert, update, delete on table
  agent_portal.organizations,
  agent_portal.teams,
  agent_portal.users,
  agent_portal.user_role_history,
  agent_portal.projects,
  agent_portal.project_number_counters,
  agent_portal.project_members,
  agent_portal.project_stage_history,
  agent_portal.intake_requests,
  agent_portal.intake_conversations,
  agent_portal.intake_messages,
  agent_portal.documents,
  agent_portal.document_versions,
  agent_portal.gates,
  agent_portal.gate_approvals,
  agent_portal.gallery_submissions,
  agent_portal.gallery_reviews,
  agent_portal.gallery_entries,
  agent_portal.audit_logs
to ax_projects_app;

grant select on table
  agent_portal.lifecycle_stages
to ax_projects_app;

grant usage, select on all sequences in schema agent_portal to ax_projects_app;

grant execute on function agent_portal.next_project_code(integer) to ax_projects_app;
grant execute on function agent_portal.change_project_stage(bigint, text, bigint, text) to ax_projects_app;

alter default privileges in schema agent_portal
  grant usage, select on sequences to ax_projects_app;

commit;

-- Verification (all rows should be true):
select
  has_schema_privilege('ax_projects_app', 'agent_portal', 'USAGE') as schema_usage,
  has_table_privilege('ax_projects_app', 'agent_portal.projects', 'SELECT,INSERT,UPDATE,DELETE') as projects_dml,
  has_table_privilege('ax_projects_app', 'agent_portal.intake_requests', 'SELECT,INSERT,UPDATE,DELETE') as intake_dml,
  has_table_privilege('ax_projects_app', 'agent_portal.documents', 'SELECT,INSERT,UPDATE,DELETE') as documents_dml,
  has_table_privilege('ax_projects_app', 'agent_portal.gates', 'SELECT,INSERT,UPDATE,DELETE') as gates_dml,
  has_table_privilege('ax_projects_app', 'agent_portal.audit_logs', 'SELECT,INSERT,UPDATE,DELETE') as audit_dml,
  has_function_privilege('ax_projects_app', 'agent_portal.next_project_code(integer)', 'EXECUTE') as project_code_execute,
  has_function_privilege('ax_projects_app', 'agent_portal.change_project_stage(bigint,text,bigint,text)', 'EXECUTE') as stage_change_execute;

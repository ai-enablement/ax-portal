-- Run once as the schema owner in hyebin_db before enabling file uploads.
begin;
create table if not exists agent_portal.document_files (
  id uuid primary key,
  project_id bigint not null references agent_portal.projects(id),
  document_type text not null check (document_type in ('ARD','DES','EVP','EVR','DEP','UG','OPS','CHG')),
  field_key text not null,
  original_name text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 5242880),
  content bytea not null,
  created_by bigint not null references agent_portal.users(id),
  created_at timestamptz not null default now(),
  check (octet_length(content) = byte_size)
);
create index if not exists document_files_project_idx on agent_portal.document_files(project_id);
grant select, insert on agent_portal.document_files to ax_projects_app;
commit;

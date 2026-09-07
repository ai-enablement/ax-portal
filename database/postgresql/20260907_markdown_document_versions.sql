begin;

create table if not exists agent_portal.markdown_document_versions (
  id uuid primary key,
  project_id bigint not null references agent_portal.projects(id) on delete cascade,
  document_type text not null check (document_type in ('DES', 'EVD', 'UG')),
  lifecycle_phase text not null check (lifecycle_phase in ('design', 'development_evaluation', 'deployment_rollout')),
  version_number integer not null check (version_number > 0),
  original_name text not null,
  mime_type text not null default 'text/markdown',
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  original_content bytea not null,
  content_markdown text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  created_by bigint not null references agent_portal.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, document_type, version_number)
);

create index if not exists markdown_document_versions_project_history_idx
  on agent_portal.markdown_document_versions(project_id, document_type, version_number desc);

grant select, insert on agent_portal.markdown_document_versions to ax_projects_app;

commit;

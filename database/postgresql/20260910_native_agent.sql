begin;
create table if not exists agent_portal.native_agent_sessions (
 project_id bigint primary key references agent_portal.projects(id) on delete cascade,
 revision integer not null default 0,
 payload jsonb not null default '{}'::jsonb,
 updated_by bigint references agent_portal.users(id),
 updated_at timestamptz not null default now()
);
create table if not exists agent_portal.native_agent_documents (
 id bigint generated always as identity primary key,
 project_id bigint not null references agent_portal.projects(id) on delete cascade,
 document_type text not null check(document_type in ('INT','FEA','ARD')),
 version_number integer not null check(version_number > 0),
 original_name text not null,
 markdown text not null,
 content_sha256 text not null,
 created_by bigint not null references agent_portal.users(id),
 created_at timestamptz not null default now(),
 unique(project_id,document_type,version_number)
);
commit;

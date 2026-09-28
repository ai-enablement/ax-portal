-- Independent RPA service: never alters Agent lifecycle projects or roles.
create table if not exists agent_portal.rpa_projects (
 id text primary key, project_code text not null, payload jsonb not null,
 source_hash text not null, imported_at timestamptz not null default now()
);
create index if not exists rpa_projects_code_idx on agent_portal.rpa_projects(project_code);
create table if not exists agent_portal.rpa_pic_links (
 project_id text not null references agent_portal.rpa_projects(id),
 pic text not null, email text not null check(email=lower(email)),
 updated_at timestamptz not null default now(), changed_by bigint not null references agent_portal.users(id),
 primary key(project_id,pic)
);
create index if not exists rpa_pic_email_idx on agent_portal.rpa_pic_links(email,project_id);
create table if not exists agent_portal.rpa_pic_history (
 id bigint generated always as identity primary key,
 project_id text not null references agent_portal.rpa_projects(id), pic text not null,
 previous_email text, email text not null, reason text not null,
 changed_by bigint not null references agent_portal.users(id), changed_at timestamptz not null default now()
);
create table if not exists agent_portal.rpa_requests (
 id bigint generated always as identity primary key,
 project_id text not null references agent_portal.rpa_projects(id),
 created_by bigint not null references agent_portal.users(id),
 idempotency_key uuid not null unique,
 payload jsonb not null, status text not null default 'received' check(status in ('received','working','testing','completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rpa_requests_project_idx on agent_portal.rpa_requests(project_id,created_at desc);
create table if not exists agent_portal.rpa_request_files (
 id uuid primary key, request_id bigint not null references agent_portal.rpa_requests(id),
 name text not null, mime_type text not null, byte_size integer not null check(byte_size>0 and byte_size<=5242880), content bytea not null
);
create index if not exists rpa_files_request_idx on agent_portal.rpa_request_files(request_id);

-- Read models: retain source data and expose operational fields without destructive conversion.
create or replace view agent_portal.rpa_master_sheet as
 select id,project_code,payload->>'name' as project_name,
 payload->>'company' as company,payload->'fields'->>'본부' as division,
 payload->>'department' as department,payload->'fields'->>'접수타입' as intake_type,
 payload->'pics' as pics,payload->'fields'->>'주기' as frequency,
 payload->>'developer' as developer,payload->'fields'->>'현업배포일자' as deployed_date,
 payload->'fields'->>'운영 PC' as operating_pc,payload->'fields'->>'실행 방법' as execution_method,
 payload->'fields'->>'실행 시간' as execution_time,payload->'fields'->>'실행일' as execution_days,
 jsonb_build_object('월',payload->'fields'->'월','화',payload->'fields'->'화','수',payload->'fields'->'수',
 '목',payload->'fields'->'목','금',payload->'fields'->'금','토',payload->'fields'->'토','일',payload->'fields'->'일') as weekdays,
 payload->>'status' as project_status,imported_at
 from agent_portal.rpa_projects;

-- The API owns access checks. No anonymous/public grants are made by this migration.
-- History is committed in the SAME transaction as request status/assignment changes.
create or replace view agent_portal.rpa_request_history as
 select r.id as request_id,r.project_id,h.ordinality as event_number,
 coalesce(h.event->>'kind','created') as event_type,
 h.event->>'at' as event_at,h.event->>'actor' as actor_name,
 h.event->>'actorEmail' as actor_email,h.event->>'label' as label,
 h.event->>'reason' as reason,h.event->'changes' as changes
 from agent_portal.rpa_requests r
 cross join lateral jsonb_array_elements(
 case when jsonb_typeof(r.payload->'history')='array' then r.payload->'history' else '[]'::jsonb end
 ) with ordinality as h(event,ordinality);
create index if not exists rpa_requests_status_created_idx on agent_portal.rpa_requests(status,created_at desc);
create index if not exists rpa_pic_history_project_idx on agent_portal.rpa_pic_history(project_id,changed_at desc);

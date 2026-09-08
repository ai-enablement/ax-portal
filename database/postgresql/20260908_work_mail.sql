-- Additive only. No historical mail is queued on the first worker scan.
create table if not exists agent_portal.work_mail_control (
  id integer primary key check(id=1),
  initialized_at timestamptz not null default now()
);
create table if not exists agent_portal.work_mail_state (
  actor_id bigint primary key references agent_portal.users(id),
  active_keys jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists agent_portal.work_mail_outbox (
  id uuid primary key,
  actor_id bigint not null references agent_portal.users(id),
  notification_key text not null,
  payload jsonb not null,
  status text not null check (status in ('pending','sending','sent','cancelled','failed','uncertain')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  result_code text
);
create index if not exists work_mail_pending_idx on agent_portal.work_mail_outbox(available_at)
  where status='pending';
create index if not exists work_mail_actor_idx on agent_portal.work_mail_outbox(actor_id,notification_key)
  where status='pending';

-- ============================================================================
-- Agent Governance Portal - On-premises PostgreSQL schema
-- Target: PostgreSQL 14+
-- Usage : Create/select the target database, then execute this entire file.
-- Schema: agent_portal
-- Notes : SSL and connection settings are intentionally not included here.
-- ============================================================================

begin;

create schema if not exists agent_portal;
set search_path = agent_portal, public;

-- ---------------------------------------------------------------------------
-- 1. Organization, account, and permission catalogs
-- ---------------------------------------------------------------------------

create table if not exists organizations (
  id bigint generated always as identity primary key,
  organization_code text not null unique,
  organization_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id bigint generated always as identity primary key,
  organization_id bigint not null references organizations(id) on delete restrict,
  team_code text not null,
  team_name text not null,
  team_type text not null default 'business'
    check (team_type in ('ai_enablement', 'business', 'control')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, team_code)
);

create table if not exists users (
  id bigint generated always as identity primary key,
  organization_id bigint not null references organizations(id) on delete restrict,
  team_id bigint references teams(id) on delete set null,
  ms_account_id text,
  email text,
  display_name text not null,
  app_role text not null default 'general_user'
    check (app_role in ('team_leader', 'team_member', 'general_user', 'admin')),
  job_title text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_ms_account_id_uidx
  on users (ms_account_id) where ms_account_id is not null;
create unique index if not exists users_email_uidx
  on users (lower(email)) where email is not null;

create table if not exists user_role_history (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  previous_role text
    check (previous_role is null or previous_role in ('team_leader', 'team_member', 'general_user', 'admin')),
  new_role text not null
    check (new_role in ('team_leader', 'team_member', 'general_user', 'admin')),
  changed_by bigint references users(id) on delete set null,
  change_reason text,
  changed_at timestamptz not null default now()
);

create table if not exists role_action_permissions (
  app_role text not null
    check (app_role in ('team_leader', 'team_member', 'general_user', 'admin')),
  action_code text not null,
  action_name text not null,
  primary key (app_role, action_code)
);

create table if not exists lifecycle_stages (
  stage_code text primary key,
  display_order smallint not null unique,
  stage_name text not null,
  stage_kind text not null check (stage_kind in ('work', 'gate')),
  primary_document_type text,
  is_terminal boolean not null default false
);

create table if not exists document_types (
  document_type text primary key,
  document_name text not null,
  lifecycle_stage_code text not null references lifecycle_stages(stage_code) on delete restrict,
  description text,
  is_required boolean not null default true
);

-- ---------------------------------------------------------------------------
-- 2. Project master, assignments, stages, and schedule
-- ---------------------------------------------------------------------------

create table if not exists project_number_counters (
  project_year integer primary key check (project_year between 2000 and 2999),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id bigint generated always as identity primary key,
  organization_id bigint not null references organizations(id) on delete restrict,
  request_team_id bigint references teams(id) on delete set null,
  project_code text not null unique
    check (project_code ~ '^[0-9]{4}-[0-9]{3,}$'),
  project_name text not null,
  project_summary text,
  requester_id bigint not null references users(id) on delete restrict,
  owner_id bigint references users(id) on delete restrict,
  current_stage_code text not null references lifecycle_stages(stage_code) on delete restrict,
  project_status text not null default 'draft'
    check (project_status in (
      'draft', 'submitted', 'in_review', 'in_progress', 'rework',
      'approved', 'pilot', 'operating', 'on_hold', 'dropped', 'retired'
    )),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  risk_level text not null default 'normal'
    check (risk_level in ('normal', 'attention', 'delayed', 'blocked')),
  progress_percent smallint not null default 0
    check (progress_percent between 0 and 100),
  track text check (track is null or track in ('low', 'medium', 'high')),
  agent_type text
    check (agent_type is null or agent_type in ('judgment', 'rule', 'hybrid')),
  autonomy_level text
    check (autonomy_level is null or autonomy_level in ('L0', 'L1', 'L2', 'L3', 'L4')),
  requested_completion_date date,
  committed_completion_date date,
  next_action text,
  schedule_note text,
  submitted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,
  deleted_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_members (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  user_id bigint not null references users(id) on delete restrict,
  relationship text not null
    check (relationship in (
      'requester', 'owner', 'developer', 'reviewer',
      'operator', 'security_reviewer', 'observer'
    )),
  assigned_by bigint references users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (project_id, user_id, relationship)
);

create table if not exists project_stage_history (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  stage_code text not null references lifecycle_stages(stage_code) on delete restrict,
  stage_state text not null
    check (stage_state in ('scheduled', 'active', 'completed', 'rework', 'rejected', 'skipped')),
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  changed_by bigint references users(id) on delete set null,
  note text,
  check (exited_at is null or exited_at >= entered_at)
);

create table if not exists project_schedules (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  milestone_code text not null,
  milestone_name text not null,
  planned_date date not null,
  actual_date date,
  schedule_status text not null default 'planned'
    check (schedule_status in ('planned', 'on_track', 'at_risk', 'delayed', 'completed', 'cancelled')),
  is_current boolean not null default true,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, milestone_code, planned_date)
);

create table if not exists deadline_change_requests (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  previous_date date,
  requested_date date not null,
  request_reason text not null,
  requested_by bigint not null references users(id) on delete restrict,
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  decided_by bigint references users(id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists project_tasks (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  stage_code text references lifecycle_stages(stage_code) on delete set null,
  task_title text not null,
  task_description text,
  assignee_id bigint references users(id) on delete set null,
  task_status text not null default 'todo'
    check (task_status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Intake request and chat history
-- ---------------------------------------------------------------------------

create table if not exists intake_requests (
  id bigint generated always as identity primary key,
  project_id bigint not null unique references projects(id) on delete cascade,
  business_problem text not null,
  current_process text,
  monthly_volume numeric(12,2),
  minutes_per_case numeric(12,2),
  people_count integer check (people_count is null or people_count >= 0),
  input_sources text,
  desired_outcome text,
  failure_impact text,
  urgency_reason text,
  raw_answers jsonb not null default '{}'::jsonb,
  completion_percent smallint not null default 0
    check (completion_percent between 0 and 100),
  intake_status text not null default 'draft'
    check (intake_status in ('draft', 'submitted', 'accepted', 'cancelled')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intake_conversations (
  id bigint generated always as identity primary key,
  intake_request_id bigint not null references intake_requests(id) on delete cascade,
  conversation_status text not null default 'active'
    check (conversation_status in ('active', 'completed', 'abandoned')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intake_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references intake_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'agent', 'system')),
  sender_user_id bigint references users(id) on delete set null,
  message_text text not null,
  message_order integer not null check (message_order > 0),
  structured_payload jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, message_order)
);

-- ---------------------------------------------------------------------------
-- 4. Common document/version/section model
-- ---------------------------------------------------------------------------

create table if not exists documents (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  document_type text not null references document_types(document_type) on delete restrict,
  document_code text not null unique,
  document_title text not null,
  document_status text not null default 'draft'
    check (document_status in ('draft', 'in_review', 'completed', 'approved', 'rejected', 'superseded')),
  current_version integer not null default 1 check (current_version > 0),
  author_id bigint references users(id) on delete set null,
  reviewer_id bigint references users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, document_type)
);

create table if not exists document_versions (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content_markdown text,
  structured_content jsonb not null default '{}'::jsonb,
  change_summary text,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create table if not exists document_sections (
  id bigint generated always as identity primary key,
  document_version_id bigint not null references document_versions(id) on delete cascade,
  section_key text not null,
  section_order integer not null check (section_order > 0),
  section_title text not null,
  section_status text not null default 'draft'
    check (section_status in ('draft', 'completed', 'needs_review', 'rework')),
  section_content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (document_version_id, section_key)
);

create table if not exists attachments (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  document_id bigint references documents(id) on delete cascade,
  file_name text not null,
  content_type text,
  storage_provider text not null default 'file_server',
  storage_path text not null,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  checksum_sha256 text,
  uploaded_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Feasibility assessment (FEA)
-- ---------------------------------------------------------------------------

create table if not exists feasibility_assessments (
  id bigint generated always as identity primary key,
  project_id bigint not null unique references projects(id) on delete cascade,
  document_id bigint unique references documents(id) on delete set null,
  requirement_summary text,
  agent_development_rationale text,
  recommendation text
    check (recommendation is null or recommendation in ('go', 'conditional_go', 'drop')),
  current_hours_per_month numeric(12,2),
  expected_hours_per_month numeric(12,2),
  saving_percent numeric(6,2) check (saving_percent is null or saving_percent between 0 and 100),
  expected_quality_effect text,
  estimated_development_md numeric(12,2),
  estimated_platform_cost numeric(14,2),
  write_permission_required boolean,
  sensitive_data_required boolean,
  usage_scope text
    check (usage_scope is null or usage_scope in ('individual', 'team', 'department', 'enterprise')),
  maximum_harm text,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feasibility_alternatives (
  id bigint generated always as identity primary key,
  feasibility_id bigint not null references feasibility_assessments(id) on delete cascade,
  alternative_code text not null
    check (alternative_code in ('process', 'existing_system', 'macro_excel', 'simple_llm')),
  is_viable boolean,
  review_result text not null,
  display_order smallint not null,
  unique (feasibility_id, alternative_code)
);

create table if not exists feasibility_diagnostics (
  id bigint generated always as identity primary key,
  feasibility_id bigint not null references feasibility_assessments(id) on delete cascade,
  diagnostic_code text not null
    check (diagnostic_code in (
      'rule_documentation', 'data_accessibility', 'error_tolerance',
      'repeatability_volume', 'political_sensitivity'
    )),
  rating text not null check (rating in ('low', 'medium', 'high')),
  rationale text,
  display_order smallint not null,
  unique (feasibility_id, diagnostic_code)
);

-- ---------------------------------------------------------------------------
-- 6. Requirement definition (ARD) and design inputs
-- ---------------------------------------------------------------------------

create table if not exists functional_requirements (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  requirement_code text not null,
  requirement_name text not null,
  description text,
  input_definition text,
  agent_behavior text,
  output_definition text,
  priority text not null check (priority in ('M', 'S', 'C')),
  acceptance_criteria text,
  requirement_status text not null default 'draft'
    check (requirement_status in ('draft', 'approved', 'implemented', 'verified', 'deferred')),
  unique (project_id, requirement_code)
);

create table if not exists knowledge_sources (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  source_type text not null
    check (source_type in ('document', 'manual', 'faq', 'api', 'database', 'file', 'system')),
  source_name text not null,
  source_version text,
  owning_team_id bigint references teams(id) on delete set null,
  refresh_cycle text,
  access_method text,
  permission_level text
    check (permission_level is null or permission_level in ('read', 'write', 'execute')),
  freshness_owner_id bigint references users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evaluation_cases (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  case_code text not null,
  category text not null,
  input_summary text not null,
  expected_output text not null,
  scoring_rule text not null,
  is_guardrail_case boolean not null default false,
  label_author_id bigint references users(id) on delete set null,
  case_status text not null default 'active'
    check (case_status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, case_code)
);

create table if not exists failure_scenarios (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  failure_type text not null
    check (failure_type in (
      'hallucination', 'stale_knowledge', 'out_of_scope', 'prompt_injection',
      'tool_failure', 'security', 'other'
    )),
  example text,
  impact text,
  mitigation text not null,
  guardrail_code text,
  evaluation_case_id bigint references evaluation_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists design_decisions (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  decision_number text not null,
  decision_text text not null,
  reviewed_alternatives text,
  selection_reason text not null,
  decision_date date not null default current_date,
  decided_by bigint references users(id) on delete set null,
  unique (project_id, decision_number)
);

-- ---------------------------------------------------------------------------
-- 7. Evaluation plan and result
-- ---------------------------------------------------------------------------

create table if not exists evaluation_runs (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  document_id bigint references documents(id) on delete set null,
  prompt_version text,
  evaluation_set_version text not null,
  scoring_method text not null check (scoring_method in ('rule', 'llm', 'human', 'hybrid')),
  reviewer_id bigint references users(id) on delete set null,
  run_status text not null default 'planned'
    check (run_status in ('planned', 'running', 'completed', 'failed', 'cancelled')),
  accuracy_percent numeric(6,2)
    check (accuracy_percent is null or accuracy_percent between 0 and 100),
  format_compliance_percent numeric(6,2)
    check (format_compliance_percent is null or format_compliance_percent between 0 and 100),
  guardrail_violation_count integer
    check (guardrail_violation_count is null or guardrail_violation_count >= 0),
  recommendation text
    check (recommendation is null or recommendation in ('deploy', 'conditional', 'redevelop')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists evaluation_case_results (
  id bigint generated always as identity primary key,
  evaluation_run_id bigint not null references evaluation_runs(id) on delete cascade,
  evaluation_case_id bigint not null references evaluation_cases(id) on delete restrict,
  actual_output text,
  score numeric(8,4),
  passed boolean,
  failure_cause text
    check (failure_cause is null or failure_cause in (
      'knowledge_gap', 'ambiguous_instruction', 'model_limit',
      'evaluation_error', 'tool_error', 'other'
    )),
  action_taken text,
  reviewed_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (evaluation_run_id, evaluation_case_id)
);

-- ---------------------------------------------------------------------------
-- 8. G1-G4 gate approvals and reviewer assignments
-- ---------------------------------------------------------------------------

create table if not exists gates (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  gate_code text not null check (gate_code in ('G1', 'G2', 'G3', 'G4')),
  gate_status text not null default 'not_ready'
    check (gate_status in ('not_ready', 'ready', 'pending', 'approved', 'conditional', 'rejected', 'rework')),
  final_decision text
    check (final_decision is null or final_decision in (
      'go', 'conditional_go', 'drop', 'approved', 'rejected', 'extended'
    )),
  decision_reason text,
  opened_at timestamptz,
  decided_at timestamptz,
  decided_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, gate_code)
);

create table if not exists gate_evidence_documents (
  gate_id bigint not null references gates(id) on delete cascade,
  document_id bigint not null references documents(id) on delete restrict,
  primary key (gate_id, document_id)
);

create table if not exists gate_approvals (
  id bigint generated always as identity primary key,
  gate_id bigint not null references gates(id) on delete cascade,
  approver_id bigint references users(id) on delete set null,
  approver_role text not null
    check (approver_role in (
      'requester', 'owner', 'developer', 'reviewer', 'team_leader', 'security_reviewer'
    )),
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected', 'rework')),
  decision_comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gate_id, approver_role)
);

create table if not exists review_assignments (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  review_type text not null check (review_type in ('peer', 'security', 'business', 'quality')),
  reviewer_id bigint not null references users(id) on delete restrict,
  assigned_by bigint not null references users(id) on delete restrict,
  review_status text not null default 'assigned'
    check (review_status in ('assigned', 'in_review', 'completed', 'rejected', 'cancelled')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  review_comment text,
  unique (project_id, review_type, reviewer_id)
);

-- ---------------------------------------------------------------------------
-- 9. Deployment checklist, user guide, and pilot
-- ---------------------------------------------------------------------------

create table if not exists deployment_checklists (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  document_id bigint unique references documents(id) on delete set null,
  deployment_type text not null default 'pilot'
    check (deployment_type in ('pilot', 'production', 'rollback')),
  pilot_target_count integer check (pilot_target_count is null or pilot_target_count >= 0),
  pilot_duration_weeks integer check (pilot_duration_weeks is null or pilot_duration_weeks >= 0),
  feedback_method text,
  exit_criteria text,
  checklist_status text not null default 'draft'
    check (checklist_status in ('draft', 'ready', 'approved', 'completed')),
  created_by bigint references users(id) on delete set null,
  approved_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deployment_checklist_items (
  id bigint generated always as identity primary key,
  checklist_id bigint not null references deployment_checklists(id) on delete cascade,
  category text not null check (category in ('pre_deploy', 'deployment', 'pilot_result')),
  item_code text not null,
  item_text text not null,
  is_required boolean not null default true,
  is_checked boolean not null default false,
  evidence text,
  checked_by bigint references users(id) on delete set null,
  checked_at timestamptz,
  unique (checklist_id, item_code)
);

create table if not exists pilot_runs (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  target_user_count integer check (target_user_count is null or target_user_count >= 0),
  feedback_method text,
  exit_criteria text,
  pilot_status text not null default 'planned'
    check (pilot_status in ('planned', 'running', 'extended', 'completed', 'stopped')),
  result_decision text
    check (result_decision is null or result_decision in ('scale', 'extend', 'withdraw')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists pilot_metrics (
  id bigint generated always as identity primary key,
  pilot_run_id bigint not null references pilot_runs(id) on delete cascade,
  metric_date date not null,
  usage_count integer not null default 0 check (usage_count >= 0),
  active_user_count integer not null default 0 check (active_user_count >= 0),
  error_report_count integer not null default 0 check (error_report_count >= 0),
  satisfaction_score numeric(4,2)
    check (satisfaction_score is null or satisfaction_score between 0 and 5),
  notes text,
  unique (pilot_run_id, metric_date)
);

create table if not exists pilot_feedback (
  id bigint generated always as identity primary key,
  pilot_run_id bigint not null references pilot_runs(id) on delete cascade,
  submitted_by bigint references users(id) on delete set null,
  rating smallint check (rating is null or rating between 1 and 5),
  category text,
  feedback_text text not null,
  feedback_status text not null default 'new'
    check (feedback_status in ('new', 'reviewed', 'planned', 'resolved')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 10. Operations registry, monthly checks, and change history
-- ---------------------------------------------------------------------------

create table if not exists operations_registry (
  id bigint generated always as identity primary key,
  project_id bigint not null unique references projects(id) on delete restrict,
  owner_id bigint references users(id) on delete set null,
  developer_operator_id bigint references users(id) on delete set null,
  knowledge_owner_id bigint references users(id) on delete set null,
  deployed_at date,
  operations_status text not null default 'pilot'
    check (operations_status in ('pilot', 'operating', 'improving', 'paused', 'retired')),
  last_checked_at date,
  next_reassessment_at date,
  sunset_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists operations_monthly_checks (
  id bigint generated always as identity primary key,
  operations_registry_id bigint not null references operations_registry(id) on delete cascade,
  check_month date not null,
  checked_by bigint references users(id) on delete set null,
  session_count integer not null default 0 check (session_count >= 0),
  user_count integer not null default 0 check (user_count >= 0),
  error_report_count integer not null default 0 check (error_report_count >= 0),
  representative_failure text,
  knowledge_revision_checked boolean not null default false,
  knowledge_updated_at date,
  reevaluation_score numeric(6,2)
    check (reevaluation_score is null or reevaluation_score between 0 and 100),
  operation_decision text not null
    check (operation_decision in ('normal', 'improvement_needed', 'suspension_review')),
  created_at timestamptz not null default now(),
  unique (operations_registry_id, check_month),
  check (date_trunc('month', check_month)::date = check_month)
);

create table if not exists change_records (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  change_number text not null,
  change_date date not null default current_date,
  change_type text not null
    check (change_type in ('prompt', 'knowledge', 'tool', 'autonomy', 'platform')),
  change_content text not null,
  reason_type text not null
    check (reason_type in ('report', 'inspection', 'regulation_change', 'planned_improvement', 'incident')),
  reevaluation_result text not null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by bigint references users(id) on delete set null,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, change_number)
);

-- Agent Gallery submissions can originate from a governed lifecycle project
-- or from an independently built Agent/App/Flow.
create table if not exists gallery_submissions (
  id bigint generated always as identity primary key,
  submission_number text not null unique,
  source_kind text not null
    check (source_kind in ('lifecycle_project', 'personal_build')),
  project_id bigint references projects(id) on delete set null,
  submitted_by bigint not null references users(id) on delete restrict,
  agent_name text not null,
  summary text not null,
  platform text not null
    check (platform in ('vibe_coding', 'copilot_studio', 'power_automate', 'power_apps', 'other')),
  artifact_kind text not null
    check (artifact_kind in ('agent', 'app', 'flow', 'automation', 'other')),
  category text not null,
  access_url text not null,
  target_users text not null,
  data_classification text not null
    check (data_classification in ('public', 'internal', 'confidential', 'personal_data')),
  support_owner text not null,
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  submission_status text not null default 'submitted'
    check (submission_status in ('submitted', 'in_review', 'changes_requested', 'recommended', 'published', 'rejected')),
  reviewer_note text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_kind = 'lifecycle_project' and project_id is not null)
    or (source_kind = 'personal_build')
  )
);

create table if not exists gallery_reviews (
  id bigint generated always as identity primary key,
  gallery_submission_id bigint not null references gallery_submissions(id) on delete cascade,
  reviewer_id bigint not null references users(id) on delete restrict,
  review_role text not null check (review_role in ('team_member', 'team_leader')),
  decision text not null
    check (decision in ('changes_requested', 'recommended', 'published', 'rejected')),
  access_verified boolean not null default false,
  data_policy_verified boolean not null default false,
  safety_notice_verified boolean not null default false,
  operation_owner_verified boolean not null default false,
  review_note text,
  reviewed_at timestamptz not null default now()
);

create table if not exists gallery_entries (
  id bigint generated always as identity primary key,
  gallery_submission_id bigint not null unique references gallery_submissions(id) on delete restrict,
  slug text not null unique,
  published_by bigint not null references users(id) on delete restrict,
  visibility text not null default 'company'
    check (visibility in ('company', 'restricted')),
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  check (retired_at is null or retired_at >= published_at)
);

-- ---------------------------------------------------------------------------
-- 11. Notifications and immutable audit trail
-- ---------------------------------------------------------------------------

create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  project_id bigint references projects(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  action_route text,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'danger', 'success')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id bigint references users(id) on delete set null,
  project_id bigint references projects(id) on delete set null,
  action_code text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  client_ip inet,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 12. Updated-at triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'organizations', 'teams', 'users', 'projects', 'project_schedules',
    'project_tasks', 'intake_requests', 'intake_conversations', 'documents',
    'document_sections', 'feasibility_assessments', 'knowledge_sources',
    'evaluation_cases', 'failure_scenarios', 'gates', 'gate_approvals',
    'deployment_checklists', 'pilot_runs', 'operations_registry', 'change_records',
    'gallery_submissions', 'gallery_entries'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on agent_portal.%I', target_table, target_table);
    execute format(
      'create trigger %I_set_updated_at before update on agent_portal.%I for each row execute function agent_portal.set_updated_at()',
      target_table,
      target_table
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Indexes for foreign keys and frequent portal queries
-- ---------------------------------------------------------------------------

create index if not exists teams_organization_id_idx on teams (organization_id);
create index if not exists users_organization_id_idx on users (organization_id);
create index if not exists users_team_id_idx on users (team_id);
create index if not exists user_role_history_user_id_idx on user_role_history (user_id, changed_at desc);
create index if not exists user_role_history_changed_by_idx on user_role_history (changed_by);
create index if not exists document_types_stage_code_idx on document_types (lifecycle_stage_code);

create index if not exists projects_stage_updated_idx
  on projects (current_stage_code, updated_at desc) where deleted_at is null;
create index if not exists projects_status_risk_idx
  on projects (project_status, risk_level, updated_at desc) where deleted_at is null;
create index if not exists projects_requester_id_idx
  on projects (requester_id) where deleted_at is null;
create index if not exists projects_owner_id_idx
  on projects (owner_id) where deleted_at is null;
create index if not exists projects_organization_id_idx on projects (organization_id);
create index if not exists projects_request_team_id_idx on projects (request_team_id);
create index if not exists projects_deleted_by_idx on projects (deleted_by);

create index if not exists project_members_user_project_idx
  on project_members (user_id, project_id) where ended_at is null;
create index if not exists project_members_project_id_idx on project_members (project_id);
create index if not exists project_members_assigned_by_idx on project_members (assigned_by);
create index if not exists project_stage_history_project_entered_idx
  on project_stage_history (project_id, entered_at desc);
create index if not exists project_stage_history_stage_code_idx on project_stage_history (stage_code);
create index if not exists project_stage_history_changed_by_idx on project_stage_history (changed_by);
create index if not exists project_schedules_project_status_date_idx
  on project_schedules (project_id, schedule_status, planned_date);
create index if not exists project_schedules_created_by_idx on project_schedules (created_by);
create index if not exists deadline_change_requests_project_decision_idx
  on deadline_change_requests (project_id, decision, created_at desc);
create index if not exists deadline_change_requests_requested_by_idx on deadline_change_requests (requested_by);
create index if not exists deadline_change_requests_decided_by_idx on deadline_change_requests (decided_by);
create index if not exists project_tasks_assignee_status_due_idx
  on project_tasks (assignee_id, task_status, due_at);
create index if not exists project_tasks_project_stage_idx on project_tasks (project_id, stage_code);
create index if not exists project_tasks_stage_code_idx on project_tasks (stage_code);

create index if not exists intake_requests_project_id_idx on intake_requests (project_id);
create index if not exists intake_conversations_request_id_idx on intake_conversations (intake_request_id);
create index if not exists intake_messages_conversation_order_idx on intake_messages (conversation_id, message_order);
create index if not exists intake_messages_sender_user_id_idx on intake_messages (sender_user_id);

create index if not exists documents_project_status_type_idx on documents (project_id, document_status, document_type);
create index if not exists documents_author_id_idx on documents (author_id);
create index if not exists documents_reviewer_id_idx on documents (reviewer_id);
create index if not exists document_versions_document_version_idx on document_versions (document_id, version_number desc);
create index if not exists document_versions_created_by_idx on document_versions (created_by);
create index if not exists document_sections_version_order_idx on document_sections (document_version_id, section_order);
create index if not exists attachments_project_created_idx on attachments (project_id, created_at desc);
create index if not exists attachments_document_id_idx on attachments (document_id);
create index if not exists attachments_uploaded_by_idx on attachments (uploaded_by);

create index if not exists feasibility_assessments_project_id_idx on feasibility_assessments (project_id);
create index if not exists feasibility_assessments_document_id_idx on feasibility_assessments (document_id);
create index if not exists feasibility_assessments_created_by_idx on feasibility_assessments (created_by);
create index if not exists feasibility_alternatives_feasibility_id_idx on feasibility_alternatives (feasibility_id);
create index if not exists feasibility_diagnostics_feasibility_id_idx on feasibility_diagnostics (feasibility_id);
create index if not exists functional_requirements_project_id_idx on functional_requirements (project_id);
create index if not exists knowledge_sources_project_id_idx on knowledge_sources (project_id);
create index if not exists knowledge_sources_owning_team_id_idx on knowledge_sources (owning_team_id);
create index if not exists knowledge_sources_freshness_owner_id_idx on knowledge_sources (freshness_owner_id);
create index if not exists evaluation_cases_project_status_idx on evaluation_cases (project_id, case_status);
create index if not exists evaluation_cases_label_author_id_idx on evaluation_cases (label_author_id);
create index if not exists failure_scenarios_project_id_idx on failure_scenarios (project_id);
create index if not exists failure_scenarios_evaluation_case_id_idx on failure_scenarios (evaluation_case_id);
create index if not exists design_decisions_project_date_idx on design_decisions (project_id, decision_date desc);
create index if not exists design_decisions_decided_by_idx on design_decisions (decided_by);
create index if not exists evaluation_runs_project_created_idx on evaluation_runs (project_id, created_at desc);
create index if not exists evaluation_runs_document_id_idx on evaluation_runs (document_id);
create index if not exists evaluation_runs_reviewer_id_idx on evaluation_runs (reviewer_id);
create index if not exists evaluation_case_results_run_id_idx on evaluation_case_results (evaluation_run_id);
create index if not exists evaluation_case_results_case_id_idx on evaluation_case_results (evaluation_case_id);
create index if not exists evaluation_case_results_reviewed_by_idx on evaluation_case_results (reviewed_by);

create index if not exists gates_project_status_idx on gates (project_id, gate_status, gate_code);
create index if not exists gates_decided_by_idx on gates (decided_by);
create index if not exists gate_evidence_documents_document_id_idx on gate_evidence_documents (document_id);
create index if not exists gate_approvals_gate_decision_idx on gate_approvals (gate_id, decision);
create index if not exists gate_approvals_approver_id_idx on gate_approvals (approver_id);
create index if not exists review_assignments_reviewer_status_idx on review_assignments (reviewer_id, review_status);
create index if not exists review_assignments_project_id_idx on review_assignments (project_id);
create index if not exists review_assignments_assigned_by_idx on review_assignments (assigned_by);

create index if not exists deployment_checklists_project_id_idx on deployment_checklists (project_id);
create index if not exists deployment_checklists_document_id_idx on deployment_checklists (document_id);
create index if not exists deployment_checklists_created_by_idx on deployment_checklists (created_by);
create index if not exists deployment_checklists_approved_by_idx on deployment_checklists (approved_by);
create index if not exists deployment_checklist_items_checklist_id_idx on deployment_checklist_items (checklist_id);
create index if not exists deployment_checklist_items_checked_by_idx on deployment_checklist_items (checked_by);
create index if not exists pilot_runs_project_start_idx on pilot_runs (project_id, start_date desc);
create index if not exists pilot_metrics_run_date_idx on pilot_metrics (pilot_run_id, metric_date desc);
create index if not exists pilot_feedback_run_status_idx on pilot_feedback (pilot_run_id, feedback_status);
create index if not exists pilot_feedback_submitted_by_idx on pilot_feedback (submitted_by);

create index if not exists operations_registry_project_id_idx on operations_registry (project_id);
create index if not exists operations_registry_owner_id_idx on operations_registry (owner_id);
create index if not exists operations_registry_developer_operator_id_idx on operations_registry (developer_operator_id);
create index if not exists operations_registry_knowledge_owner_id_idx on operations_registry (knowledge_owner_id);
create index if not exists operations_monthly_checks_registry_month_idx
  on operations_monthly_checks (operations_registry_id, check_month desc);
create index if not exists operations_monthly_checks_checked_by_idx on operations_monthly_checks (checked_by);
create index if not exists change_records_project_date_idx on change_records (project_id, change_date desc);
create index if not exists change_records_approved_by_idx on change_records (approved_by);
create index if not exists change_records_created_by_idx on change_records (created_by);
create index if not exists gallery_submissions_status_submitted_idx
  on gallery_submissions (submission_status, submitted_at desc);
create index if not exists gallery_submissions_project_id_idx on gallery_submissions (project_id);
create index if not exists gallery_submissions_submitted_by_idx on gallery_submissions (submitted_by, submitted_at desc);
create index if not exists gallery_reviews_submission_reviewed_idx
  on gallery_reviews (gallery_submission_id, reviewed_at desc);
create index if not exists gallery_reviews_reviewer_id_idx on gallery_reviews (reviewer_id, reviewed_at desc);
create index if not exists gallery_entries_published_idx
  on gallery_entries (published_at desc) where retired_at is null;
create index if not exists gallery_entries_published_by_idx on gallery_entries (published_by);
create index if not exists notifications_user_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_project_id_idx on notifications (project_id);
create index if not exists audit_logs_project_created_idx on audit_logs (project_id, created_at desc);
create index if not exists audit_logs_actor_created_idx on audit_logs (actor_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 14. Reference data: lifecycle, document types, and role actions
-- ---------------------------------------------------------------------------

insert into lifecycle_stages (
  stage_code, display_order, stage_name, stage_kind, primary_document_type, is_terminal
) values
  ('INT',   1, '요구 접수',       'work', 'INT', false),
  ('FEA',   2, '타당성 평가',     'work', 'FEA', false),
  ('G1',    3, '착수 승인',       'gate', null,  false),
  ('ARD',   4, '요구 정의',       'work', 'ARD', false),
  ('G2',    5, '개발 착수',       'gate', null,  false),
  ('DES',   6, '설계·개발',       'work', 'DES', false),
  ('EVP',   7, '평가 계획',       'work', 'EVP', false),
  ('EVR',   8, '평가 결과',       'work', 'EVR', false),
  ('G3',    9, '배포 승인',       'gate', null,  false),
  ('PILOT',10, '파일럿',          'work', 'DEP', false),
  ('G4',   11, '확산 승인',       'gate', null,  false),
  ('OPS',  12, '운영·개선',       'work', 'OPS', true)
on conflict (stage_code) do update set
  display_order = excluded.display_order,
  stage_name = excluded.stage_name,
  stage_kind = excluded.stage_kind,
  primary_document_type = excluded.primary_document_type,
  is_terminal = excluded.is_terminal;

insert into document_types (
  document_type, document_name, lifecycle_stage_code, description, is_required
) values
  ('INT', '에이전트 요구 접수서',       'INT',   '요구자의 업무 문제와 기대 결과 접수', true),
  ('FEA', '타당성 평가서',             'FEA',   '대안·적합성·효과·위험과 Go/Drop 근거', true),
  ('ARD', '에이전트 요구사항 정의서',   'ARD',   '범위·자율성·기능·데이터·평가 기준', true),
  ('DES', '에이전트 설계서',           'DES',   '아키텍처·프롬프트·지식·도구·보안 설계', true),
  ('EVP', '평가 계획서',               'EVP',   '평가셋·라벨·채점 방식·통과 기준', true),
  ('EVR', '평가 결과 보고서',          'EVR',   '지표 결과·실패 사례·배포 권고', true),
  ('DEP', '배포 체크리스트',           'PILOT', '배포 전 확인과 파일럿 결과', true),
  ('UG',  '사용자 가이드',             'PILOT', '사용 방법·한계·주의·신고 경로', true),
  ('OPS', '운영 대장',                 'OPS',   '운영 현황·월간 점검·재평가·폐기', true),
  ('CHG', '개선 이력서',               'OPS',   '변경 내용·사유·재평가 결과·승인', true)
on conflict (document_type) do update set
  document_name = excluded.document_name,
  lifecycle_stage_code = excluded.lifecycle_stage_code,
  description = excluded.description,
  is_required = excluded.is_required;

insert into role_action_permissions (app_role, action_code, action_name) values
  ('general_user', 'PROJECT_CREATE',          '새 Agent 과제 요청'),
  ('general_user', 'PROJECT_READ_RELATED',    '요청자·Owner 관련 과제 조회'),
  ('general_user', 'PROJECT_DELETE_INTAKE',   '요구 접수 단계 과제 삭제'),
  ('general_user', 'INT_EDIT',                '요구 접수서 작성'),
  ('general_user', 'ARD_COLLABORATE',         '요구사항 정의 공동 작성'),
  ('general_user', 'G2_APPROVE_REQUESTER',    '요구자 G2 승인'),
  ('general_user', 'G4_APPROVE_OWNER',        'Project Owner G4 승인'),
  ('general_user', 'GALLERY_SUBMIT',          'Agent Gallery 등록 신청'),
  ('team_member',  'PROJECT_READ_ASSIGNED',   '담당·리뷰 과제 전체 이력 조회'),
  ('team_member',  'PROJECT_READ_NEW_INTAKE', '신규 접수 과제 모니터링'),
  ('team_member',  'FEA_EDIT',                '타당성 평가서 작성'),
  ('team_member',  'ARD_EDIT',                '요구사항 정의서 작성'),
  ('team_member',  'G2_APPROVE_DEVELOPER',    '개발 담당자 G2 승인'),
  ('team_member',  'DES_EDIT',                '에이전트 설계서 작성'),
  ('team_member',  'EVP_EDIT',                '평가 계획서 작성'),
  ('team_member',  'EVR_EDIT',                '평가 결과 보고서 작성'),
  ('team_member',  'G3_PEER_REVIEW',          'G3 동료 리뷰'),
  ('team_member',  'DEP_EDIT',                '배포 체크리스트 작성'),
  ('team_member',  'UG_EDIT',                 '사용자 가이드 작성'),
  ('team_member',  'OPS_EDIT',                '운영 대장 작성'),
  ('team_member',  'CHG_EDIT',                '개선 이력서 작성'),
  ('team_member',  'GALLERY_REVIEW',          'Gallery 신청 검토·보완 요청'),
  ('team_member',  'GALLERY_RECOMMEND',       'Gallery 등록 권고'),
  ('team_leader',  'PROJECT_READ_ALL',        '팀 전체 과제 조회'),
  ('team_leader',  'FEA_EDIT',                '타당성 평가서 작성·보완'),
  ('team_leader',  'G1_DECIDE',               'G1 Go/Conditional Go/Drop 판정'),
  ('team_leader',  'ASSIGN_DEVELOPER',        '개발 담당자 지정'),
  ('team_leader',  'G2_APPROVE_LEADER',       '팀장 G2 승인'),
  ('team_leader',  'ASSIGN_REVIEWER',         '동료 리뷰어 지정'),
  ('team_leader',  'G3_DECIDE',               'G3 배포 승인'),
  ('team_leader',  'G4_APPROVE_LEADER',       'G4 확산 승인'),
  ('team_leader',  'DEADLINE_CHANGE_DECIDE',  '프로젝트 마감일 변경 승인'),
  ('team_leader',  'GALLERY_REVIEW',          'Gallery 신청 검토·보완 요청'),
  ('team_leader',  'GALLERY_PUBLISH',         'Gallery 최종 등록 승인'),
  ('admin',        'PROJECT_READ_ALL',        '모든 과제 조회'),
  ('admin',        'PROJECT_CREATE',          '과제 생성'),
  ('admin',        'PROJECT_UPDATE_ANY',      '모든 과제 수정'),
  ('admin',        'PROJECT_DELETE_ANY',      '모든 과제 삭제'),
  ('admin',        'ROLE_MANAGE',             '사용자 역할 관리'),
  ('admin',        'WORKFLOW_OVERRIDE',       '워크플로 상태 교정'),
  ('admin',        'AUDIT_READ',              '감사 이력 조회')
on conflict (app_role, action_code) do update set action_name = excluded.action_name;

-- ---------------------------------------------------------------------------
-- 15. Atomic project number and stage-change helper functions
-- ---------------------------------------------------------------------------

create or replace function next_project_code(p_project_year integer default extract(year from current_date)::integer)
returns text
language plpgsql
as $$
declare
  next_number integer;
begin
  if p_project_year not between 2000 and 2999 then
    raise exception 'Invalid project year: %', p_project_year;
  end if;

  insert into project_number_counters (project_year, last_number)
  values (p_project_year, 1)
  on conflict (project_year) do update
    set last_number = project_number_counters.last_number + 1,
        updated_at = now()
  returning last_number into next_number;

  return p_project_year::text || '-' || lpad(next_number::text, 3, '0');
end;
$$;

create or replace function change_project_stage(
  p_project_id bigint,
  p_new_stage_code text,
  p_changed_by bigint,
  p_note text default null
)
returns void
language plpgsql
as $$
declare
  old_stage_code text;
begin
  perform 1 from lifecycle_stages where stage_code = p_new_stage_code;
  if not found then
    raise exception 'Unknown lifecycle stage: %', p_new_stage_code;
  end if;

  select current_stage_code into old_stage_code
  from projects
  where id = p_project_id and deleted_at is null
  for update;

  if old_stage_code is null then
    raise exception 'Project not found: %', p_project_id;
  end if;

  update project_stage_history
  set stage_state = 'completed', exited_at = now()
  where project_id = p_project_id
    and stage_code = old_stage_code
    and stage_state = 'active'
    and exited_at is null;

  update projects
  set current_stage_code = p_new_stage_code,
      project_status = case
        when p_new_stage_code = 'OPS' then 'operating'
        when p_new_stage_code in ('G1','G2','G3','G4') then 'in_review'
        else 'in_progress'
      end
  where id = p_project_id;

  insert into project_stage_history (
    project_id, stage_code, stage_state, changed_by, note
  ) values (
    p_project_id, p_new_stage_code, 'active', p_changed_by, p_note
  );

  insert into audit_logs (
    actor_user_id, project_id, action_code, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_changed_by, p_project_id, 'PROJECT_STAGE_CHANGE', 'project', p_project_id::text,
    jsonb_build_object('stageCode', old_stage_code),
    jsonb_build_object('stageCode', p_new_stage_code, 'note', p_note)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. Views used by the current portal screens
-- ---------------------------------------------------------------------------

create or replace view v_project_overview as
select
  p.id,
  p.project_code,
  p.project_name,
  p.project_summary,
  rt.team_name as request_team_name,
  requester.display_name as requester_name,
  owner_user.display_name as owner_name,
  developer.display_name as developer_name,
  reviewer.display_name as reviewer_name,
  p.current_stage_code,
  ls.stage_name as current_stage_name,
  ls.display_order as stage_order,
  p.project_status,
  p.priority,
  p.risk_level,
  p.progress_percent,
  p.track,
  p.agent_type,
  p.autonomy_level,
  p.requested_completion_date,
  p.committed_completion_date,
  p.next_action,
  p.schedule_note,
  p.created_at,
  p.updated_at
from projects p
join lifecycle_stages ls on ls.stage_code = p.current_stage_code
left join teams rt on rt.id = p.request_team_id
join users requester on requester.id = p.requester_id
left join users owner_user on owner_user.id = p.owner_id
left join lateral (
  select u.display_name
  from project_members pm
  join users u on u.id = pm.user_id
  where pm.project_id = p.id
    and pm.relationship = 'developer'
    and pm.ended_at is null
  order by pm.assigned_at desc
  limit 1
) developer on true
left join lateral (
  select u.display_name
  from project_members pm
  join users u on u.id = pm.user_id
  where pm.project_id = p.id
    and pm.relationship = 'reviewer'
    and pm.ended_at is null
  order by pm.assigned_at desc
  limit 1
) reviewer on true
where p.deleted_at is null;

create or replace view v_pending_approvals as
select
  p.project_code,
  p.project_name,
  g.gate_code,
  g.gate_status,
  ga.approver_role,
  u.display_name as approver_name,
  ga.decision,
  ga.created_at as requested_at
from gate_approvals ga
join gates g on g.id = ga.gate_id
join projects p on p.id = g.project_id
left join users u on u.id = ga.approver_id
where p.deleted_at is null
  and ga.decision = 'pending';

create or replace view v_member_workload as
select
  u.id as user_id,
  u.display_name,
  count(*) filter (where pm.relationship = 'developer') as developer_project_count,
  count(*) filter (where pm.relationship = 'reviewer') as reviewer_project_count,
  count(*) filter (where p.risk_level = 'delayed') as delayed_project_count,
  count(*) filter (where p.risk_level = 'blocked') as blocked_project_count,
  round(avg(p.progress_percent), 1) as average_progress_percent
from users u
join project_members pm on pm.user_id = u.id and pm.ended_at is null
join projects p on p.id = pm.project_id and p.deleted_at is null
where u.app_role in ('team_member', 'team_leader')
group by u.id, u.display_name;

commit;

-- ============================================================================
-- Verification queries (run after COMMIT)
-- ============================================================================

select count(*) as table_count
from information_schema.tables
where table_schema = 'agent_portal'
  and table_type = 'BASE TABLE';

select stage_code, display_order, stage_name, stage_kind
from agent_portal.lifecycle_stages
order by display_order;

select document_type, document_name, lifecycle_stage_code
from agent_portal.document_types
order by lifecycle_stage_code, document_type;

-- Optional database-account permissions. Replace the role name before use.
-- grant usage on schema agent_portal to agent_portal_app;
-- grant select, insert, update, delete on all tables in schema agent_portal to agent_portal_app;
-- grant usage, select on all sequences in schema agent_portal to agent_portal_app;
-- grant execute on all functions in schema agent_portal to agent_portal_app;

begin;

alter table agent_portal.users
  drop constraint if exists users_app_role_check;
alter table agent_portal.users
  add constraint users_app_role_check
  check (app_role in ('team_leader', 'team_member', 'bts', 'bp_solution', 'general_user', 'admin'));

alter table agent_portal.user_role_history
  drop constraint if exists user_role_history_previous_role_check;
alter table agent_portal.user_role_history
  add constraint user_role_history_previous_role_check
  check (previous_role is null or previous_role in ('team_leader', 'team_member', 'bts', 'bp_solution', 'general_user', 'admin'));
alter table agent_portal.user_role_history
  drop constraint if exists user_role_history_new_role_check;
alter table agent_portal.user_role_history
  add constraint user_role_history_new_role_check
  check (new_role in ('team_leader', 'team_member', 'bts', 'bp_solution', 'general_user', 'admin'));

alter table agent_portal.role_action_permissions
  drop constraint if exists role_action_permissions_app_role_check;
alter table agent_portal.role_action_permissions
  add constraint role_action_permissions_app_role_check
  check (app_role in ('team_leader', 'team_member', 'bts', 'bp_solution', 'general_user', 'admin'));

insert into agent_portal.role_action_permissions (app_role, action_code, action_name) values
  ('bp_solution', 'PROJECT_READ_ASSIGNED', '비피 솔루션 배정 과제 전체 이력 조회'),
  ('bp_solution', 'ARD_EDIT',              '배정 과제 요구사항 정의서 작성'),
  ('bp_solution', 'G2_APPROVE_DEVELOPER',  '개발 담당자 G2 승인'),
  ('bp_solution', 'DES_EDIT',              '배정 과제 에이전트 설계서 작성'),
  ('bp_solution', 'EVP_EDIT',              '배정 과제 평가 계획서 작성'),
  ('bp_solution', 'EVR_EDIT',              '배정 과제 평가 결과 보고서 작성'),
  ('bp_solution', 'DEP_EDIT',              '배정 과제 배포 체크리스트 작성'),
  ('bp_solution', 'UG_EDIT',               '배정 과제 사용자 가이드 작성'),
  ('bp_solution', 'OPS_EDIT',              '배정 과제 운영 대장 작성'),
  ('bp_solution', 'CHG_EDIT',              '배정 과제 개선 이력서 작성'),
  ('bp_solution', 'GALLERY_SUBMIT',        '본인 제작 Agent Gallery 등록 신청')
on conflict (app_role, action_code) do update
set action_name = excluded.action_name;

create or replace view agent_portal.v_member_workload as
select
  u.id as user_id,
  u.display_name,
  count(*) filter (where pm.relationship = 'developer') as developer_project_count,
  count(*) filter (where pm.relationship = 'reviewer') as reviewer_project_count,
  count(*) filter (where p.risk_level = 'delayed') as delayed_project_count,
  count(*) filter (where p.risk_level = 'blocked') as blocked_project_count,
  round(avg(p.progress_percent), 1) as average_progress_percent
from agent_portal.users u
left join agent_portal.project_members pm
  on pm.user_id = u.id and pm.ended_at is null
left join agent_portal.projects p
  on p.id = pm.project_id and p.deleted_at is null
where u.app_role in ('team_member', 'team_leader', 'bts', 'bp_solution', 'admin')
  and u.is_active = true
group by u.id, u.display_name;

commit;

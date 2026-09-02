begin;

alter table agent_portal.projects
  add column if not exists project_category text;

update agent_portal.projects
   set project_category = '개별 접수'
 where project_category is null
    or project_category not in ('개별 접수', '아이디어톤', 'D2B', 'RPA(기존 과제)', '기타');

alter table agent_portal.projects
  alter column project_category set default '개별 접수',
  alter column project_category set not null;

alter table agent_portal.projects
  drop constraint if exists projects_project_category_check;

alter table agent_portal.projects
  add constraint projects_project_category_check
  check (project_category in ('개별 접수', '아이디어톤', 'D2B', 'RPA(기존 과제)', '기타'));

commit;

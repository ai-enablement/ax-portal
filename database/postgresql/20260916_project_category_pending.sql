-- Run before deploying: preserve existing classifications and allow pending intake.
-- Execute this entire statement; DROP and ADD are atomic together.
ALTER TABLE agent_portal.projects
 DROP CONSTRAINT IF EXISTS projects_project_category_check,
 ADD CONSTRAINT projects_project_category_check
 CHECK (project_category IN ('미정','개별 접수','아이디어톤','D2B','RPA(기존 과제)','기타'));

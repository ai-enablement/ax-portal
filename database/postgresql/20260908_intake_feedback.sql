begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Additive vocabulary change: retain all historical platform and document values.
alter table agent_portal.markdown_document_versions
  drop constraint if exists markdown_document_versions_document_type_check,
  drop constraint if exists markdown_document_versions_lifecycle_phase_check;
alter table agent_portal.markdown_document_versions
  add constraint markdown_document_versions_document_type_check check (document_type in ('DES','EVD','UG','ARD_LITE')),
  add constraint markdown_document_versions_lifecycle_phase_check check (lifecycle_phase in ('design','development_evaluation','deployment_rollout','fast_track_requirements'));

alter table agent_portal.gallery_submissions
  drop constraint if exists gallery_submissions_platform_check,
  drop constraint if exists gallery_submissions_platforms_check;
alter table agent_portal.gallery_submissions
  add constraint gallery_submissions_platform_check check (platform in ('vibe_coding','copilot_studio','power_automate','power_apps','power_platform','other')),
  add constraint gallery_submissions_platforms_check check (
    jsonb_typeof(platforms)='array' and jsonb_array_length(platforms)>0
    and platforms <@ '["vibe_coding","copilot_studio","power_automate","power_apps","power_platform","other"]'::jsonb
  );
commit;

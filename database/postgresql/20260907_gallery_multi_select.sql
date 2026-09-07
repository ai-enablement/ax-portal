begin;

alter table agent_portal.gallery_submissions
  add column if not exists platforms jsonb not null default '[]'::jsonb,
  add column if not exists data_classifications jsonb not null default '[]'::jsonb;

update agent_portal.gallery_submissions
   set platforms = jsonb_build_array(platform)
 where jsonb_array_length(platforms) = 0;

update agent_portal.gallery_submissions
   set data_classifications = jsonb_build_array(data_classification)
 where jsonb_array_length(data_classifications) = 0;

update agent_portal.gallery_submissions
   set category = case
     when category in ('자료검색','데이터분석','업무자동화','교육/가이드','기타') then category
     when category = '생산성' then '업무자동화'
     else '기타'
   end;

alter table agent_portal.gallery_submissions
  drop constraint if exists gallery_submissions_platforms_check,
  drop constraint if exists gallery_submissions_data_classifications_check,
  drop constraint if exists gallery_submissions_category_check;

alter table agent_portal.gallery_submissions
  add constraint gallery_submissions_platforms_check check (
    jsonb_typeof(platforms) = 'array'
    and jsonb_array_length(platforms) > 0
    and platforms <@ '["vibe_coding","copilot_studio","power_automate","power_apps","other"]'::jsonb
  ),
  add constraint gallery_submissions_data_classifications_check check (
    jsonb_typeof(data_classifications) = 'array'
    and jsonb_array_length(data_classifications) > 0
    and data_classifications <@ '["public","internal","confidential","personal_data"]'::jsonb
  ),
  add constraint gallery_submissions_category_check check (
    category in ('자료검색','데이터분석','업무자동화','교육/가이드','기타')
  );

commit;

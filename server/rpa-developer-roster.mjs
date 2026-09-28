export async function rpaDeveloperRoster(client){
 return (await client.query(`select u.id::text as id,u.display_name as name,
 coalesce(u.email,login.email,'') as email,u.app_role as role
 from agent_portal.users u left join agent_portal.users login on login.id=u.shared_account_id
 where u.is_active=true and u.app_role in ('bts','bp_solution')
 and (u.shared_account_id is null or (login.is_active=true and login.app_role=u.app_role))
 order by u.display_name,u.id`)).rows;
}
export async function resolveRpaDevelopers(client,ids){
 const fail=()=>{throw Object.assign(new Error('Admin & Governance에 등록된 활성 BTS·비피솔루션 담당 개발자만 선택할 수 있습니다.'),{status:400});};
 if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id))||new Set(ids).size!==ids.length)fail();
 const roster=await rpaDeveloperRoster(client),selected=ids.map(id=>roster.find(u=>u.id===id));
 if(selected.some(u=>!u))fail();
 return selected;
}

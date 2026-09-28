import {validatePics,picFields} from '../shared/rpa-pics.mjs';
export async function syncRpaPics(client,project,items,actor,reason){
 const pics=validatePics(items);
 const links=(await client.query('select pic,email from agent_portal.rpa_pic_links where project_id=$1',[project.id])).rows;
 const before=(project.pics||[]).map(pic=>({pic,email:links.find(l=>l.pic===pic)?.email||''}));
 const changed=JSON.stringify(before)!==JSON.stringify(pics);
 if(changed){
  await client.query('delete from agent_portal.rpa_pic_links where project_id=$1',[project.id]);
  for(const x of pics.filter(x=>x.email))await client.query('insert into agent_portal.rpa_pic_links(project_id,pic,email,changed_by) values($1,$2,$3,$4)',[project.id,x.pic,x.email,actor.id]);
 }
 return {...project,pics:pics.map(x=>x.pic),fields:{...project.fields,...picFields(pics)},history:[...(project.history||[]),...(changed?[{kind:'pic_updated',label:'PIC 정보 변경',at:new Date().toISOString(),actor:actor.display_name,actorEmail:actor.email,reason,changes:{PIC:{before,after:pics}}}]:[])]};
}

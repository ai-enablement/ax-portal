const valid=value=>value!==undefined&&value!==null&&String(value).trim()!=='';
export function projectActorId(actor){return actor?.id??actor?.userId;}
export function isProjectParty(project,actor,role){
  if(actor?.is_active===false)return false;
  const id=role==='requester'?(project.requester_id??project.requesterId):(project.owner_id??project.ownerId);
  const actorId=projectActorId(actor);
  // A persisted assignment wins over stale/missing email display fields.
  if(valid(id))return valid(actorId)&&String(id)===String(actorId);
  const email=role==='requester'?project.requesterEmail:project.projectOwnerEmail;
  return Boolean(email&&actor?.email&&email.trim().toLowerCase()===actor.email.trim().toLowerCase());
}
export function isProjectDeveloper(project,actor){
  const id=projectActorId(actor);
  return actor?.is_active!==false&&valid(id)&&(project.developerIds||[]).some(value=>String(value)===String(id));
}
export function isProjectApprover(project,actor,role){
  if(actor?.is_active===false)return false;
  if(role==='requester'||role==='owner')return isProjectParty(project,actor,role);
  if(role==='team_leader')return (actor?.appRole??actor?.app_role)==='team_leader';
  return role==='security_reviewer'&&valid(project.securityReviewerId)&&valid(projectActorId(actor))&&String(project.securityReviewerId)===String(projectActorId(actor));
}

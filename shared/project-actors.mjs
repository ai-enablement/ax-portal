import {emailFromPartyLabel,isContactEmail,normalizeContactEmail} from './project-contacts.mjs';
const valid=value=>value!==undefined&&value!==null&&String(value).trim()!=='';
export function projectActorId(actor){return actor?.id??actor?.userId;}
export function projectActorIds(actor){return [...new Set([projectActorId(actor),...(actor?.sharedUserIds||[])].filter(valid).map(String))];}
export function matchesProjectActor(actor,id){return valid(id)&&projectActorIds(actor).includes(String(id));}
export function isProjectParty(project,actor,role){
  if(actor?.is_active===false)return false;
  const id=role==='requester'?(project.requester_id??project.requesterId):(project.owner_id??project.ownerId);
  // An independently assigned ID remains authoritative; a registrant fallback does not.
  if(project.historicalImport&&(!valid(id)||!valid(project.createdByUserId)||String(id)===String(project.createdByUserId))){
    const email=normalizeContactEmail(role==='requester'?project.requesterEmail:project.projectOwnerEmail)||emailFromPartyLabel(role==='requester'?project.requester:project.projectOwner||project.owner);
    return isContactEmail(email)&&email===normalizeContactEmail(actor?.email);
  }
  // A persisted assignment wins over stale/missing email display fields.
  if(valid(id))return matchesProjectActor(actor,id);
  const email=role==='requester'?project.requesterEmail:project.projectOwnerEmail;
  return Boolean(email&&actor?.email&&email.trim().toLowerCase()===actor.email.trim().toLowerCase());
}
export function isProjectDeveloper(project,actor){
  const id=projectActorId(actor);
  return actor?.is_active!==false&&valid(id)&&(project.developerIds||[]).some(value=>matchesProjectActor(actor,value));
}
export function isProjectApprover(project,actor,role){
  if(actor?.is_active===false)return false;
  if(role==='requester'||role==='owner')return isProjectParty(project,actor,role);
  if(role==='team_leader')return (actor?.appRole??actor?.app_role)==='team_leader';
  return role==='security_reviewer'&&matchesProjectActor(actor,project.securityReviewerId);
}

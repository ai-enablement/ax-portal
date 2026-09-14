import {standardDocuments} from './standard-documents.mjs';
import {contentText} from './document-content.mjs';
const marker='<!-- PORTAL-APPROVAL-STATUS -->';
export function legacyArdMarkdown(state){
 const fields=state.historicalDocuments?.[3]?.documents?.ARD?.fields||{};
 const sections=standardDocuments.ARD.sections.map(section=>`## ${section.title}\n\n`+section.fields.map(field=>{
  const value=fields[`${section.id}.${field.id}`];
  const text=typeof value==='string'?value:contentText(value);
  return text?`### ${field.label}\n\n${text}`:'';
 }).filter(Boolean).join('\n\n')).join('\n\n');
 return `# ARD 요구사항 정의서 · 기존 저장 문서\n\n${sections}`;
}
const cell=value=>String(value||'—').replaceAll('|','\\|').replace(/\r?\n/g,' ');
export const ardPartiesApproved=state=>['requester','owner'].every(role=>state.workflowApprovals?.G2?.[role]?.decision==='APPROVED');
export function finalDocument(markdown,code,author,at){
 let text=String(markdown||'').split(marker)[0].trim();
 text=text.replace(/^.*이 문서는.*에이전트가 생성한 초안.*$/gm,'').replace(/^.*담당자 검토 전에는 확정 문서가 아닙니다.*$/gm,'');
 text=text.replace(/^(#{1,6} .*?)(초안)/gm,'$1최종본');
 text=text.replaceAll('(에이전트 초안)',cell(author));
 if(!text.includes('<!-- PORTAL-FINAL -->'))text=`<!-- PORTAL-FINAL -->\n> ${code} 작성 최종본 · 작성 완료: ${cell(author)} · ${cell(at)}\n> 문서 작성 완료와 게이트 승인은 별도입니다.\n\n${text}`;
 return text;
}
export function withArdApprovals(markdown,state){
 const rows=[['requester','요구자'],['owner','Project Owner'],['team_leader','팀장 · 개발 착수']].map(([role,label])=>{
  const vote=state.workflowApprovals?.G2?.[role];
  return `| ${label} | ${cell(vote?.actorName)} | ${vote?.decision==='APPROVED'?'승인 완료':vote?.decision==='REWORK'?'보완 요청':'승인 대기'} | ${cell(vote?.at)} | ${cell(vote?.reason)} |`;
 });
 return String(markdown).split(marker)[0].trim()+`\n\n${marker}\n## 승인 현황\n\n| 역할 | 승인자 | 상태 | 처리 시각 | 의견 |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

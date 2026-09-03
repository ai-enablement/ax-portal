import { contentText } from './document-content.mjs';

export const AGENT_TYPES = ['AI Agent (판단형)', '업무지원 Agent (규칙형)', '혼합형'];
export const AUTONOMY_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4'];
export function classifyProject(input = {}) {
  const signals = [input.writeExec && '쓰기·실행 권한', input.sensitive && '개인정보·기밀 취급', input.damageFinancial && '금전·법적 피해 가능성', ['L2','L3','L4'].includes(input.autonomy) && '자율성 L2 이상', input.scope === 'COMPANY' && '전사 사용'].filter(Boolean);
  const medium = ['DEPT','MULTI_DEPT'].includes(input.scope);
  const track = signals.length ? 'HIGH' : medium ? 'MEDIUM' : 'LOW';
  return {track, label: {HIGH:'상',MEDIUM:'중',LOW:'하'}[track], signals: signals.length ? signals : [medium ? '부서 단위 이상 사용' : '개인·팀 내 보조 도구'], citation:'에이전트 개발 표준체계 0.3절'};
}

// OPS reflects upstream source records, never stale manually entered classification/names.
export function operationsSourceFields(project = {}) {
  const fea = project.feaDraft;
  const ard = project.historicalDocuments?.['3']?.documents?.ARD;
  const confirmed = ard?.status === 'complete' ? contentText(ard.fields?.['autonomy.level']).match(/^L[0-4]/)?.[0] : '';
  const autonomy = confirmed || (AUTONOMY_LEVELS.includes(fea?.autonomy) ? fea.autonomy : '');
  const draftTrack = fea ? classifyProject(fea) : null;
  const finalTrack = fea ? classifyProject({...fea,autonomy}) : null;
  const track = draftTrack?.track === 'HIGH' || finalTrack?.track === 'HIGH' ? '상' : finalTrack?.label || '';
  const dep = project.historicalDocuments?.['7']?.documents?.DEP;
  return {
    'owners.type': AGENT_TYPES.includes(fea?.agentType) ? fea.agentType : '',
    'owners.track': track,
    'owners.autonomy': autonomy,
    'owners.owner': project.projectOwner || project.owner || '',
    'owners.operator': (project.developerNames || []).filter(Boolean).join(' · '),
    'owners.knowledgeOwner': contentText(dep?.fields?.['readiness.knowledgeOwner']),
  };
}

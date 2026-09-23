// Only pending legacy shortcuts are eligible. Existing approvals and documents
// remain untouched; deployed/operating tasks are never moved backwards.
export function pendingLowTrackDevelopment(state,at=new Date().toISOString()){
 if(!state.lowRoute?.enabled||Number(state.journeyStep)!==9||!['registration','ready'].includes(state.lowRoute.phase)||state.lowRoute.deployedAt)return null;
 if(!['GO','CONDITIONAL'].includes(state.g1Resolution?.decision)||!state.developerIds?.length)throw Error('G1 승인 및 개발 담당자 배정을 확인해 주세요.');
 if(state.historicalImport&&!state.historicalImportFinalizedAt)throw Error('과거 이관 완료 전에는 전환할 수 없습니다.');
 if(Object.values(state.workflowApprovals?.G3||{}).length||Object.values(state.workflowApprovals?.G4||{}).length)throw Error('후속 승인 이력이 있어 수동 검토가 필요합니다.');
 return {...state,journeyStep:5,stage:5,deliveryPhase:'development',status:'개발·평가 진행 중',nextAction:'개발·평가 진행 중',progress:Math.round(5/9*100),lowRoute:{...state.lowRoute,phase:'development',migratedAt:at,previousPhase:state.lowRoute.phase,reason:'하 트랙 흐름 변경 · G1 후 개발·평가'}};
}

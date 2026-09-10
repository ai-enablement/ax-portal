import test from 'node:test';
import assert from 'node:assert/strict';
import {getPool,closePool} from '../server/db/pool.mjs';
import {nativeAgentRequest} from '../server/native-agent.mjs';
import {loadCompletedNativeDocuments,buildCumulativeMarkdown} from '../server/markdown-documents.mjs';

// Explicit opt-in. All project/session/document/audit mutations are rolled back.
test('native Markdown persistence, revisions, stage advancement and role denial',{
 skip:process.env.PORTAL_NATIVE_DB_TEST!=='1'||!process.env.PORTAL_AGENT_PYTHON,
},async()=>{
 const pool=getPool(),client=await pool.connect();
 try{
  await client.query('begin');
  const row=(await client.query("select p.id,p.project_code from agent_portal.projects p join agent_portal.intake_requests i on i.project_id=p.id where p.deleted_at is null order by p.id limit 1 for update of p")).rows[0];
  assert.ok(row);
  const admin=(await client.query("select email from agent_portal.users where app_role='admin' and is_active=true limit 1")).rows[0];
  assert.ok(admin);
  const identity={email:admin.email,source:'microsoft'};
  const state={name:'Transactional test only',journeyStep:0};
  await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(coalesce(raw_answers,'{}'),'{portalState}',$2::jsonb) where project_id=$1",[row.id,JSON.stringify(state)]);
  await client.query('delete from agent_portal.native_agent_sessions where project_id=$1',[row.id]);
  const deps={pool:client,transact:async work=>{await client.query('savepoint native_test');try{const r=await work(client);await client.query('release savepoint native_test');return r;}catch(e){await client.query('rollback to savepoint native_test');throw e;}}};
  let rev=0;
  const call=async(path,method='GET',data={},document='INT')=>{
   const r=await nativeAgentRequest(identity,row.project_code,document,path,method,data,rev,deps);
   assert.equal(r.status,200,JSON.stringify(r.body));rev=r.revision??rev;return r;
  };
  await assert.rejects(nativeAgentRequest({email:'unassigned-test@example.invalid'},row.project_code,'INT','/api/bootstrap','GET',{},0,deps),e=>e.status===403);
  await call(`/api/projects/${row.project_code}`,'PUT',{int_data:{requester_name:'검증 사용자',requester_dept:'검증 부서',problem:'회의실 예약 가능 시간을 여러 일정표에서 매번 대조해야 합니다.',who:'회의 일정 관리 담당자',as_is:'각 일정표를 열어서 빈 시간을 확인하고 예약 내용을 수기로 등록합니다.',risk:'예약 시간이 중복되어 중요 회의가 지연됩니다.',when:'다음 달 말까지',frequency:'20',minutes:'10',people:'1'}});
  await assert.rejects(nativeAgentRequest(identity,row.project_code,'INT',`/api/projects/${row.project_code}`,'PUT',{int_data:{problem:'stale'}},0,deps),e=>e.status===409);
  await call('/api/intake/finalize','POST');
  const incomplete=await nativeAgentRequest(identity,row.project_code,'INT','/portal/complete','POST',{},rev,deps);
  assert.equal(incomplete.status,400);
  await call(`/api/projects/${row.project_code}`,'PUT',{int_data:{pain_point:'각 직원의 일정표를 하나씩 대조하는 작업에서 누락이 자주 발생합니다.',systems:'Outlook 일정표와 사내 회의실 예약 시스템',minutes:'10분'}});
  await call('/api/intake/finalize','POST');
  const history=await call('/portal/history');assert.ok(history.body.versions.length);
  const id=history.body.versions[0].id;
  const doc=await call('/portal/version/'+id);assert.match(doc.text,new RegExp(row.project_code+'-INT'));
  await call('/portal/complete','POST');
  const saved=(await client.query('select raw_answers from agent_portal.intake_requests where project_id=$1',[row.id])).rows[0].raw_answers.portalState;
  assert.equal(saved.journeyStep,1);assert.equal(saved.nativeAgentArtifacts.INT.status,'complete');
  assert.equal(saved.workflowApprovals,undefined);
  await assert.rejects(nativeAgentRequest(identity,row.project_code,'INT',`/api/projects/${row.project_code}`,'PUT',{int_data:{problem:'late edit'}},rev,deps),e=>e.status===403);
  await call('/api/fea/generate','POST',{form:{summary:'팀 회의 일정을 통합 조회하여 일정 확인 시간을 줄이는 에이전트입니다.',alt_process:'규정 개선만으로는 여러 일정표의 실시간 대조를 해결할 수 없습니다.',alt_system:'기존 시스템에는 여러 일정표의 통합 조회 기능이 없습니다.',alt_macro:'여러 시스템에 있는 일정 데이터를 실시간으로 연결해야 합니다.',alt_llm:'실시간 일정 확인에 필요한 데이터 조회 기능이 없습니다.',alt_conclusion:'일정 데이터를 통합 조회하는 에이전트가 필요합니다.',roi_saving:'일정 확인에 소요되는 반복적인 작업 시간을 줄입니다.',write_exec:false,sensitive:false,identifying:true,scope:'팀',damage_financial:false,autonomy:'L1',needs_judgment:true,has_rule_flow:true,damage_desc:'잘못된 일정 정보로 회의 준비가 지연될 수 있습니다.',written_by:'검증 담당자',fit_rule_doc_grade:'상'}},'FEA');
  await call('/portal/complete','POST',{},'FEA');
  const afterFea=(await client.query('select raw_answers from agent_portal.intake_requests where project_id=$1',[row.id])).rows[0].raw_answers.portalState;
  assert.equal(afterFea.journeyStep,2);assert.equal(afterFea.nativeAgentArtifacts.FEA.track,'MEDIUM');
  // Simulate reaching ARD within the isolated fixture, never grant a real approval.
  await client.query("update agent_portal.intake_requests set raw_answers=jsonb_set(raw_answers,'{portalState,journeyStep}','3') where project_id=$1",[row.id]);
  await client.query("update agent_portal.projects set current_stage_code='ARD' where id=$1",[row.id]);
  await call('/api/ard/generate','POST',{form:{one_line:'팀 일정 담당자가 회의를 준비할 때 여러 시스템의 회의 일정을 통합 조회합니다.',scope_limit:'일정을 조회하여 후보 시간을 알려주고 실제 예약은 사람이 합니다.',in_scope:'연결된 일정표를 조회하고 가능한 회의 시간 후보를 제시합니다.',out_scope:'직접 회의실을 예약하거나 참석자의 일정을 변경하지 않습니다.',human_point:'담당자가 후보 시간을 확인한 뒤 별도로 회의실을 예약합니다.',autonomy_level:'L1',autonomy_reason:'예약을 직접 실행하지 않고 조회 결과를 정리하는 초안만 제공합니다.'}},'ARD');
  await call('/portal/complete','POST',{},'ARD');
  const afterArd=(await client.query('select raw_answers from agent_portal.intake_requests where project_id=$1',[row.id])).rows[0].raw_answers.portalState;
  assert.equal(afterArd.journeyStep,4);assert.equal(afterArd.nativeAgentArtifacts.ARD.status,'complete');
  assert.equal(afterArd.workflowApprovals,undefined);
  // A newer saved draft must not replace the referenced completed version.
  await client.query(`insert into agent_portal.native_agent_documents(project_id,document_type,version_number,original_name,markdown,content_sha256,created_by)
    select $1,'INT',max(version_number)+1,'draft.md','UNFINISHED_DRAFT_ONLY','draft',min(created_by)
    from agent_portal.native_agent_documents where project_id=$1 and document_type='INT'`,[row.id]);
  afterArd.nativeAgentArtifacts.INT.status='draft';
  const completed=await loadCompletedNativeDocuments(client,row.id,afterArd);
  assert.equal(completed.length,3);
  for(const phase of ['design','development_evaluation','deployment_rollout']){
   const markdown=buildCumulativeMarkdown({project_code:row.project_code,project_name:'검증',current_stage_code:'DES'},afterArd,phase,[],completed);
   for(const document of completed)assert.ok(markdown.includes(document.markdown));
   assert.doesNotMatch(markdown,/UNFINISHED_DRAFT_ONLY/);
  }
  await assert.rejects(loadCompletedNativeDocuments(client,'-1',afterArd),/완료된 원본/);
 }finally{await client.query('rollback');client.release();await closePool();}
});

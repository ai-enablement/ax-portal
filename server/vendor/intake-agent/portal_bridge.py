"""One isolated request to the original engine. Portal owns identity and persistence."""
import json
import sys
import os
import copy
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')
import app as A

packet = json.load(sys.stdin)
project = copy.deepcopy(packet['project'])
events = []
def load(no):
    # One request owns this isolated snapshot. Preserve in-place form mutations too:
    # ARD generation updates ard_form before saving only the rendered document patch.
    return project if no == project['project_no'] else None
def save(patch):
    if patch.get('project_no') != project['project_no']:
        raise ValueError('Project mismatch')
    project.update(copy.deepcopy(patch))
    project['updated_at'] = A._now()
    return copy.deepcopy(project)
def audit(event, no='', user='', **fields):
    entry = dict(event=event, project_no=project['project_no'], user=packet['actor'], at=A._now(), **fields)
    events.append(entry)
    return entry
A.load_project = load
A.save_project = save
A.list_projects = lambda archived=False: [] if archived else [A._row(project)]
A.audit = audit
A.read_audit = lambda *args, **kwargs: packet.get('audit', [])
A.standard_status = lambda: A.R.load_standard(Path(__file__).parent / 'Agent_개발_표준체계.md')
A._STD_CACHE = A.standard_status()
def config():
    A._LLM.update(key=os.environ.get('AZURE_OPENAI_API_KEY',''), endpoint=os.environ.get('AZURE_OPENAI_ENDPOINT','').rstrip('/'), deployment=os.environ.get('AZURE_OPENAI_DEPLOYMENT',''), source='Portal server', api_version=os.environ.get('AZURE_OPENAI_API_VERSION','2024-12-01-preview'))
    return A._LLM
A.load_llm_config = config
config()
class NoRedirect(A.urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise A.LLMError('AI endpoint redirects are not allowed')
A.urllib.request.install_opener(A.urllib.request.build_opener(NoRedirect()))
# Do not expose model error bodies (which may contain internal request details).
original_chat = A.llm_chat
def safe_chat(system, user, max_tokens=4000, timeout=90):
    try:
        # Preserve prompts and parsers; use the portal's Azure v1 transport.
        endpoint = A.urllib.parse.urlsplit(A._LLM['endpoint'])
        url = f'{endpoint.scheme}://{endpoint.netloc}/openai/v1/chat/completions'
        request = A.urllib.request.Request(url, data=json.dumps({
            'model': A._LLM['deployment'],
            'messages': [{'role':'system','content':system},{'role':'user','content':user}],
            'max_completion_tokens': max_tokens,
        },ensure_ascii=False).encode('utf-8'), method='POST', headers={
            'Content-Type':'application/json','api-key':A._LLM['key'],
        })
        with A.urllib.request.urlopen(request, timeout=timeout) as raw:
            response = json.loads(raw.read(12*1024*1024))['choices'][0]['message']['content'].strip()
        audit('native_llm_success')
        return response
    except Exception as error:
        audit('native_llm_failure', error_type=type(error).__name__, http_status=getattr(error,'code',None))
        raise A.LLMError('AI 연결을 확인해 주세요. 입력 내용은 보존됩니다.')
A.llm_chat = safe_chat
body = packet.get('body', {})
body['user'] = packet['actor']
body['project_no'] = project['project_no']
if packet['path'] == '/portal/complete':
    kind = packet['body']['document']
    form = project.get({'INT':'int_data','FEA':'fea_form','ARD':'ard_form'}[kind], {})
    assessment = {'INT':A.R.assess_int,'FEA':A.R.assess_fea,'ARD':A.R.ard_ready_for_meeting}[kind](form)
    ready = bool(assessment.get('ready')) or packet.get('allowHistoricalIncomplete') is True
    print(json.dumps({'status':200 if ready else 400,'body':{'ok':ready,'error':None if ready else '원본 Agent의 필수 정보 확인을 완료하고 문서를 다시 생성해 주세요.','assessment':assessment},'project':project,'audit':events},ensure_ascii=False))
    sys.exit(0)
with A.app.test_client() as client:
    response = client.open(packet['path'], method=packet['method'], json=body if packet['method'] != 'GET' else None)
    result = response.get_json(silent=True)
    if packet['path'] == '/api/bootstrap' and result:
        result['llm'] = {'ready': A.llm_ready(), 'deployment': A._LLM['deployment'], 'source': 'Portal server'}
    print(json.dumps({'status':response.status_code, 'body':result, 'text':None if result is not None else response.get_data(as_text=True), 'contentType':response.content_type, 'project':project, 'audit':events},ensure_ascii=False))

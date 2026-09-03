# 신규 과제 INT·FEA 인터뷰 Agent

기반: https://github.com/torebang/intake-feasibility-agent/tree/a956da83cb408461a8c6a5d93374256d30ebfe90

원본 `app.py`의 인터뷰 제어·프롬프트와 `rules.py`의 슬롯 검증·보류 원칙을 포털 Node 서버에 맞게 재구성했다. 원본 Flask 서버, 파일 저장, 로컬 설정 UI는 배포하지 않는다. 분류는 포털 공통 `classifyProject`를 재사용한다. 정량 수치를 추정하지 않고, 정량 2회/서술 3회 질문 후 보류하며 이후 답변을 받으면 다시 확인할 수 있다.

## 설정

App Service 서버 환경 변수: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`.
리소스 기본 HTTPS 엔드포인트 또는 `/openai/v1/` 주소를 사용한다. 서버는 Azure OpenAI v1 chat/completions와 strict JSON schema를 사용한다. 배포 모델은 구조화 출력을 지원해야 한다. 키는 서버만 읽고 브라우저나 로그로 보내지 않는다. App Service가 AI 리소스로 접근 가능한 네트워크 설정과 쿼터가 필요하다. API 버전/모델을 임의로 추측하거나 다른 모델로 자동 전환하지 않는다.

## 사용

신규 과제 기본정보 등록 → 홈의 요구 접수 또는 타당성 평가 → INT+FEA 인터뷰. 인터뷰의 추출값과 AI 제안은 확인 대기이며 체크한 항목을 명시적으로 반영해야 문서가 바뀐다. 직접 작성 중인 문서는 먼저 저장한다. 다른 사람이 저장한 값은 자동 덮어쓰지 않는다. 대화, 보류·확인·재시도 상태는 `intake_requests.raw_answers.portalState.agentSession`, 메시지는 `intake_messages`, 문서는 `documents`/`document_versions`, 이벤트는 `audit_logs`에 저장한다. 기존 JSONB를 사용하므로 별도 테이블 마이그레이션은 필요하지 않다.

과거 이관 과제, INT/FEA 이후 과제, 비활성·무관계 계정은 서버에서 차단한다. 일반 사용자는 자기 과제의 정보 확인과 초안 반영만 가능하다. FEA 완료와 게이트 승인 권한은 기존 서버 권한을 유지한다. 인터뷰 사용 과제는 미확보 필수 정보가 있는 상태에서 완료할 수 없다. AI는 승인·단계 이동·개발자 배정을 하지 않는다.

## 저장 및 장애

AI 호출 전에 짧은 트랜잭션으로 답변과 요청 ID/처리 상태를 저장하고 DB 잠금을 해제한다. 모델 호출 후 다시 짧은 트랜잭션으로 결과를 저장한다. 같은 과제의 동시 요청은 제한하며 완료 요청 ID는 중복 처리하지 않는다. 실패하면 같은 답변을 재시도할 수 있다. 키 미설정은 명시적으로 안내하고 고정 응답을 AI 성공으로 표시하지 않는다. 65초 호출 제한, 90초 작업 만료, 최대 200개 대화 메시지/6,000자 입력을 둔다.

SSO는 기존 App Service Easy Auth 경계를 사용한다. Azure 인증을 우회하는 서버 직접 노출은 허용하지 않아야 한다. 기존 사내 PostgreSQL Hybrid Connection 및 보안 정책은 그대로 사용한다.

## 검증

`node --test tests/intake-agent.test.mjs`는 모의 Azure 호출과 권한/추출/보류/확인/충돌 처리를 검증한다. 실제 Azure 호출 및 실계정 브라우저 E2E는 배포 후 별도 확인한다. 원본에서 요구하는 리뷰어 평가셋 검증은 이 자동 테스트를 통과하는 것과 별개다.

2026-09-03 검증: 프로덕션 빌드 성공, 일반 회귀 119개 통과, 실제 PostgreSQL 임시 테이블 회귀 3개 통과(모두 롤백). 독립 UI harness에서 답변 → 확인 → 반영 → 보류 해제와 390px 모바일 레이아웃 검증. AI 호출은 모의 응답이며 실제 Azure 배포 모델·키·네트워크와 SSO 브라우저 E2E는 아직 검증하지 않았다. 이 작업환경에는 Azure AI 환경 변수가 없어, App Service 배포 후 설정을 사용해 최종 확인해야 한다.

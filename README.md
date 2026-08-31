# Agent Governance Portal

AI 에이전트 과제의 요구 접수부터 타당성 평가, 승인, 설계·개발·평가,
배포, 파일럿, 운영·개선까지 한 화면에서 관리하는 역할 기반 포털입니다.

## 주요 기능

- 일반 User: 과제 요청, 산출물 확인, 승인 참여, 운영 문서 조회
- AI 활성화팀 팀원: 배정 과제 수행, FEA·ARD·DES·EVP·EVR·DEP·UG 작성
- AI 활성화팀 팀장: G1~G4 게이트 판단, 담당자·리뷰어 배정, 일정 변경 승인
- Admin: 전체 과제 조회·수정·삭제
- 단계별 산출물 상세보기와 승인·반려 이력 시각화
- 요구 접수 단계의 사용자 삭제 및 Admin 전체 관리 기능

## 현재 데이터 방식

현재 버전은 UI/UX 검증용 프로토타입이며 입력·변경 데이터는 브라우저의
`localStorage`에 저장됩니다. 온프레미스 PostgreSQL용 초기 스키마는
[`database/postgresql/agent_governance_portal_schema.sql`](database/postgresql/agent_governance_portal_schema.sql)에
있으며, 서버 API와의 실제 연동은 별도 작업이 필요합니다.

## 실행 방법

필수 환경은 Node.js 22.13 이상입니다.

```bash
npm ci
npm run dev
```

기본 개발 주소는 Vite가 출력하는 로컬 URL을 사용합니다.

## 검증

```bash
npm test
npm run lint
```

`npm test`는 배포용 빌드와 전체 사용자 흐름 테스트를 함께 실행합니다.

## 주요 디렉터리

```text
app/                  화면과 역할별 업무 흐름
database/postgresql/  온프레미스 PostgreSQL 초기 스키마
public/               정적 자산
scripts/              Sites 빌드·검증 도구
tests/                역할·문서·사용자 흐름 회귀 테스트
worker/               Cloudflare Worker 진입점
.openai/hosting.json  Sites 프로젝트 연결 설정
```

## 배포

운영 사이트는 OpenAI Sites에서 관리합니다. `.openai/hosting.json`의
`project_id`를 임의로 변경하지 마세요. 운영 배포 전에는 전체 테스트를
통과하고, 승인된 커밋만 별도 버전으로 저장해 배포해야 합니다.

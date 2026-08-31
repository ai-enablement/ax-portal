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

## PostgreSQL 연결 구조

포털에는 온프레미스 PostgreSQL 연결 계층이 포함되어 있습니다.
DB 비밀번호는 브라우저나 배포 번들에 넣지 않고, 사내 API 게이트웨이에서만
사용합니다.

```text
사용자 브라우저
  → 포털의 /api/database (비밀값 비노출)
  → 사내 PostgreSQL 게이트웨이
  → 온프레미스 PostgreSQL (SSL 미사용)
```

현재 Agent Gallery 신청·검토·등록 흐름이 이 API를 우선 사용합니다. 게이트웨이가
아직 설정되지 않았거나 접속할 수 없으면 기존 목업 데이터와 브라우저 임시 저장소로
자동 전환되어 UI 검토를 계속할 수 있습니다.

## `.env` 설정

저장소 루트에 [`.env.example`](.env.example)과 로컬 전용 `.env` 양식이 준비되어
있습니다. `.env`의 `CHANGE_ME` 값과 PostgreSQL 주소를 실제 값으로 교체하세요.
완성된 `.env`와 자동 생성되는 `.dev.vars`는 Git에 포함되지 않습니다.

```dotenv
PGHOST=사내_DB_주소
PGPORT=5432
PGDATABASE=agent_governance_portal
PGUSER=agent_portal_app
PGPASSWORD=실제_비밀번호
PGSSLMODE=disable

PORTAL_GATEWAY_TOKEN=충분히_긴_임의_문자열
DATABASE_GATEWAY_URL=http://사내_게이트웨이_주소:8787
DATABASE_GATEWAY_TOKEN=PORTAL_GATEWAY_TOKEN과_동일한_값
```

초기 스키마는
[`database/postgresql/agent_governance_portal_schema.sql`](database/postgresql/agent_governance_portal_schema.sql)을
온프레미스 DB에서 먼저 실행합니다. 그 후 아래 순서로 연결을 확인합니다.

```bash
npm run db:check
npm run db:gateway
```

다른 터미널에서 포털을 실행합니다.

```bash
npm run dev:with-db
```

배포 사이트에서는 `.env` 파일을 업로드하지 않습니다. Sites 환경변수에는
`DATABASE_GATEWAY_TOKEN`만 비밀값으로 등록하고, 사내 게이트웨이는 private HTTP
tunnel 또는 사내에서 승인된 HTTPS 엔드포인트로 연결해야 합니다. PostgreSQL의
`PGPASSWORD`는 계속 사내 게이트웨이에만 보관합니다.

## 실행 방법

필수 환경은 Node.js 22.13 이상입니다.

```bash
npm ci
npm run dev:with-db
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

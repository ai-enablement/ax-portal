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

## Azure Web App + PostgreSQL 연결 구조

포털은 표준 Next.js Node.js 애플리케이션으로 실행되며, 같은 Web App의
`/api/database` 서버 API가 온프레미스 PostgreSQL에 접속합니다. DB 비밀번호는
브라우저나 정적 번들에 포함되지 않습니다.

```text
사용자 브라우저
  → Azure Web App의 /api/database (Node.js 서버 API)
  → Azure Hybrid Connection (PostgreSQL 호스트:5432)
  → 온프레미스 PostgreSQL (SSL 미사용)
```

현재 Agent Gallery 신청·검토·등록 흐름이 이 API를 우선 사용합니다. DB에
아직 접속할 수 없으면 기존 목업 데이터와 브라우저 임시 저장소로
자동 전환되어 UI 검토를 계속할 수 있습니다.

## `.env` 설정

저장소 루트에 [`.env.example`](.env.example)과 로컬 전용 `.env` 양식이 준비되어
있습니다. `.env`의 `CHANGE_ME` 값과 PostgreSQL 주소를 실제 값으로 교체하세요.
완성된 `.env`는 Git에 포함되지 않습니다.

```dotenv
PGHOST=사내_DB_주소
PGPORT=5432
PGDATABASE=agent_governance_portal
PGUSER=agent_portal_app
PGPASSWORD=실제_비밀번호
PGSSLMODE=disable
NEXT_PUBLIC_APP_URL=http://localhost:4180
```

초기 스키마는
[`database/postgresql/agent_governance_portal_schema.sql`](database/postgresql/agent_governance_portal_schema.sql)을
온프레미스 DB에서 먼저 실행합니다. 그 후 연결을 확인합니다.

```bash
npm run db:check
npm run dev:with-db
```

Azure 배포에서는 `.env` 파일을 업로드하지 않습니다. 동일한 항목을 Azure Web App의
환경 변수에 등록합니다. `PGHOST`와 `PGPORT`는 Azure Hybrid Connection에 등록한
Endpoint Host 및 Endpoint Port와 정확히 같아야 합니다. 자세한 절차는
[`azure/README.md`](azure/README.md)를 참고하세요.

## 실행 방법

필수 환경은 Node.js 22.13 이상입니다.

```bash
npm ci
npm run dev:with-db
```

기본 개발 주소는 `http://localhost:4180`입니다.

## 검증

```bash
npm test
npm run lint
```

`npm test`는 배포용 빌드와 전체 사용자 흐름 테스트를 함께 실행합니다.

## 주요 디렉터리

```text
app/                  화면과 역할별 업무 흐름
app/api/database/     Azure Web App에서 실행되는 PostgreSQL API
azure/                Azure App Settings·Hybrid Connection 배포 안내
database/postgresql/  온프레미스 PostgreSQL 초기 스키마
public/               정적 자산
server/               PostgreSQL 연결 풀과 데이터 처리 로직
tests/                역할·문서·사용자 흐름 회귀 테스트
```

## 배포

운영 사이트는 Azure Web App의 Node.js 22 런타임에서 실행합니다. 빌드 명령은
`npm run build`, 시작 명령은 `npm start`입니다. 운영 배포 전에는 전체 테스트를
통과하고 Azure Hybrid Connection 상태가 `Connected`인지 확인해야 합니다.

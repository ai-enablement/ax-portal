# Azure Web App 배포 설정

## 1. Web App

- 런타임: Node.js 22 LTS
- 운영 체제: Linux 또는 Windows
- 배포 빌드: `npm run build`
- 시작 명령: `npm start`
- App Service Plan: Hybrid Connections를 지원하는 Basic 이상

Azure는 실행 포트를 `PORT` 환경변수로 제공합니다. `next start`가 이 값을 자동으로
사용하므로 별도 포트 설정은 하지 않습니다.

## 2. Hybrid Connection

Azure Portal에서 Web App → Networking → Hybrid connections로 이동합니다.

1. 기존 프로젝트에서 사용하는 Relay/Hybrid Connection 환경을 재사용하거나 새 연결을 추가합니다.
2. Endpoint Host에는 PostgreSQL 서버의 DNS 호스트명을 입력합니다.
3. Endpoint Port에는 PostgreSQL 포트(기본 `5432`)를 입력합니다.
4. HCM이 설치된 사내 서버에서 해당 연결을 추가합니다.
5. Azure Portal의 연결 상태가 `Connected`인지 확인합니다.

`localhost`나 `127.0.0.1`을 Endpoint Host로 사용하지 않습니다. HCM 서버가 DNS로
조회하고 TCP로 접근할 수 있는 PostgreSQL 호스트명을 사용해야 합니다.

## 3. App Settings

[`app-settings.example.json`](app-settings.example.json)의 항목을 Web App → Settings →
Environment variables에 등록합니다.

- `PGHOST`: Hybrid Connection의 Endpoint Host와 동일
- `PGPORT`: Hybrid Connection의 Endpoint Port와 동일
- `PGPASSWORD`: 배포 파일이나 GitHub가 아닌 Azure App Settings에만 저장
- `PGSSLMODE`: 현재 온프레미스 정책에 따라 `disable`
- `NEXT_PUBLIC_APP_URL`: 실제 Web App URL

## 4. 확인

배포 후 아래 주소가 `ok: true`, `schema_ready: true`를 반환해야 합니다.

```text
https://<web-app-name>.azurewebsites.net/api/database/health
```

Agent Gallery 상단 표시가 `목업 데이터`에서 `PostgreSQL 연결`로 바뀌면 화면과 DB
연동까지 완료된 상태입니다.

## 5. Microsoft Entra 로그인과 역할

Web App → Settings → Authentication에서 Microsoft를 단일 테넌트 ID 공급자로
추가하고 인증되지 않은 요청은 Microsoft 로그인으로 리디렉션합니다. 사용자 이름과
이메일, 앱 역할은 App Service Easy Auth의 `X-MS-CLIENT-PRINCIPAL` 헤더에서 읽으므로
Microsoft Graph `User.ReadBasic.All` 권한은 추가하지 않습니다.

Microsoft Entra는 회사 계정 인증과 이메일·이름·Object ID 전달만 담당합니다. 최종
화면과 권한은 `agent_portal.users.app_role`로 결정하며 AI 활성화팀의
`Admin & Governance → 계정·역할`에서 관리합니다. 새 사용자는 첫 로그인 때 일반 User로
자동 등록됩니다. 팀장은 일반 User와 AI 활성화팀 팀원을 등록·변경할 수 있고, 팀원은
목록과 감사 이력을 조회만 할 수 있습니다. Admin은 전체 역할을 관리합니다.

처음 역할을 관리할 팀장과 Admin만 Web App 환경 변수로 부트스트랩합니다.

```text
PORTAL_BOOTSTRAP_LEADER_EMAILS=choi.bd@changshininc.com
PORTAL_BOOTSTRAP_ADMIN_EMAILS=portal.admin@changshininc.com
PORTAL_ORGANIZATION_CODE=CHANGSHIN_INC
PORTAL_ORGANIZATION_NAME=창신INC
PORTAL_AI_TEAM_CODE=AI_ENABLEMENT
PORTAL_AI_TEAM_NAME=AI 활성화팀
```

부트스트랩 계정으로 로그인한 뒤 나머지 AI 활성화팀 계정을 포털에서 등록합니다.
최초 로그인 시 Entra 이메일·이름·Object ID가 해당 DB 계정과 동기화됩니다. 환경 변수
변경 후에는 Web App을 재시작합니다.

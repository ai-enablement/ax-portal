# 담당 업무 메일 연결

## 구조

Next.js Node instrumentation이 서버 시작 시 한 번, 이후 1시간마다 현재 담당 업무와 발송 대기열을 확인한다. 브라우저 알림센터와 같은 `buildWorkNotifications` 및 같은 DB 조회/접근 범위를 사용한다. 별도 승인 로직은 만들지 않는다. 메일은 정상 가동 중 다음 확인 주기까지 최대 약 1시간 지연될 수 있으며, 재시도도 다음 주기에 처리한다. 본인 테스트 메일은 주기나 신규 알림 유무와 무관하게 즉시 요청한다.

`off`(기본)는 동작하지 않는다. `baseline`은 현재 알림만 기록하며 발송하지 않는다. `test`는 모든 신규 알림을 지정 테스트 수신자에게 보낸다. `live`는 실제 담당자의 DB 이메일로 보낸다. 기존 알림은 최초 스캔 시 일괄 발송하지 않는다. 시작 이후의 신규 계정/새 업무는 발송 대상이다.

## 설치 / 활성화

메일의 포털 주소는 실행 시점의 `PORTAL_APP_URL`을 우선 사용하고, 없으면 기존 `NEXT_PUBLIC_APP_URL`을 사용한다. 전체 HTTPS 주소가 필요하며, Origin 검증은 유지한다. 공개 환경 변수의 빌드 시점 고정을 피하도록 서버 전용 설정 함수로 읽는다.

1. `node --env-file=.env scripts/migrate-work-mail.mjs`로 추가 테이블을 설치한다.
2. App Service 시스템 할당 관리 ID를 Flow의 특정 사용자 허용 목록에 등록한다. Anyone은 사용하지 않는다.
3. Flow 요청 스키마: 필수 문자열 `notificationId`, `recipient`, `subject`, `htmlBody`.
4. Outlook To/Subject/Body에 각각 요청 필드를 매핑한다. 메일 성공 뒤 HTTP 응답 200 본문 `{"status":"sent","notificationId":"@{triggerBody()?['notificationId']}"}`를 반환한다.
5. 서버에 `POWER_AUTOMATE_MAIL_URL`, 운영 HTTPS `NEXT_PUBLIC_APP_URL`, `PORTAL_MAIL_MODE=baseline`을 설정한다. 테스트 리다이렉트 시 `PORTAL_MAIL_TEST_RECIPIENT`를 설정한다. 관리 ID 자격증명은 Azure가 주입하므로 소스에 저장하지 않는다.
6. App Service Always On을 켠다. Node worker는 웹앱 프로세스가 살아 있을 때만 작동한다.
7. Admin 로그인 상태의 `/api/work-mail` GET으로 설정/발송 상태를 조회한다. POST `{"action":"send-self-test"}`는 현재 Admin 자신의 이메일로만 1건 테스트한다(동일 Origin 필수).
8. Azure 관리 ID 실제 인증 및 Flow 응답을 확인한 뒤 `live`로 전환한다. 모드 변경은 App Service 재시작을 동반할 수 있다.

## 운용과 제한

- DB advisory lock으로 여러 앱 인스턴스 간 중복 스캔/발송을 직렬화한다. 큐는 DB에 남아 재시작 후에도 보존된다.
- 담당자 업무가 없어지거나 계정이 비활성화되면 아직 대기 중인 메일은 취소한다.
- 인증 등 전송 전 실패/429는 최대 5회 지수 백오프로 재시도한다.
- 202, 5xx, 연결 끊김 등 발송 여부가 불명확하면 `uncertain`으로 격리한다. 재전송 전에 Flow 실행 기록 확인이 필요하다. Outlook/HTTP의 분산 처리 특성상 완전한 exactly-once 보장은 하지 않는다.
- 메일 링크는 SSO 및 현재 DB 접근 권한 확인 후 현재 할 일로 이동한다. 메일의 과거 단계로 강제 이동하지 않는다.
- 폴링 간격 내 생성 후 완료된 매우 짧은 액션은 메일 대상에 잡히지 않을 수 있다. 업무 화면에서는 기존 즉시 알림이 계속 적용된다.
- `failed`/`uncertain` 상태는 Admin API 또는 DB로 점검한다. 수동 재시도 UI는 제공하지 않는다.
- 기존 알림 전체 발송이나 기존 과제 상태 변경을 수행하지 않는다.

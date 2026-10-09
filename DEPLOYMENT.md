# 학교별 GAS 연동 시험 배포

2026-10-09 갱신. 공용 Vercel 화면·중계와 학교별 GAS/Drive를 연결하는 시험판입니다. 기존 v4 운영 설치에는 적용하지 말고 새 GAS 프로젝트와 가상 연수로 시험하세요.

## 배포 결과

### 공개 운영 주소 — 전환 완료

2026-10-09. 고정 운영 주소는 https://teachersign-schools-test-20261003.vercel.app 이다. Production에는 별도의 `TEACHERSIGN_COOKIE_SECRET` Secret과 해당 주소의 `TEACHERSIGN_ORIGIN` Config를 등록했다. Production 배포 ID는 `dpl_5tRCEcodtpWfgz5MNsUgZLuE4Cn1`이며 상태는 READY이다. `/api/runtime`는 `{mode:"gas",ready:true}`를 반환한다.

사용자 승인 후 이 프로젝트의 Vercel 인증 범위를 `prod_deployment_urls_and_all_previews`로 변경했다. 운영 고정 주소는 공개하고 Preview와 배포별 URL은 보호한다. 기존 Preview와 Production 배포별 주소가 로그인 없는 요청을 `vercel.com/sso-api`로 리디렉션하는 것을 확인했다. 팀 기본값과 다른 프로젝트는 변경하지 않았다.

Vercel·Google 로그인과 기존 쿠키가 없는 새 모바일 브라우저에서 참여 경로가 학교 관리자 로그인 없이 열리는 것을 확인했다. 서버 준비·학교 정보 조회는 200, 관리자 세션·자료 조회는 미로그인 401이었다. 존재하지 않는 연수와 잘못된 참여 토큰은 400으로 거부됐다. 실제 유효한 QR로 서명 저장하는 검사는 수행하지 않았다. 결과는 로컬 `artifacts/public-access-results.json`, 화면은 `public-participant-access.png`, `public-school-login.png`에 있다.

관리자 기능에는 기존 학교 계정 로그인을 유지하고 참여 화면에는 QR 토큰·선택적 참여 인증번호를 적용한다. 기존 Preview QR은 보호된 이전 호스트를 가리키므로 공개 고정 주소에서 다시 공유해야 한다. 학교 GAS·계정·연수·서명 자료를 이전하거나 다시 설치할 필요는 없다.

### 현재 Preview 시험 주소

- 최종 시험 주소: https://teachersign-schools-test-20261003-19493oz8x.vercel.app
- 대상: Preview / 상태: READY / Node 함수: `api/gateway`
- 배포 ID: `dpl_915FkntWLeHqYrFs5vfGy2SKtujA`
- 최초 10월 3일 배포에서는 브라우저의 학교 설치 화면·코드 복사/내려받기 버튼, API 준비 200, 미로그인 접근 401, 잘못된 로그인 JSON 400을 확인했다.
- 10월 9일에는 사용자가 제공한 학교 GAS에서 로그인 없는 상태 조회와 POST `info` 응답을 확인했다. 조회 오류를 보완한 Preview에서도 `/api/school/info`가 약 4초 만에 200을 반환했고 `serverVersion:5.0.0`, `accountConfigured:true`, `storageReady:true`를 확인했다. 관리자 암호를 받거나 실제 로그인 요청을 보내지는 않았다.
- Preview 접근 보호를 유지했으므로 사용자는 연결된 Vercel 계정으로 접근한다. 자동화 검증은 공식 Vercel CLI 인증과 격리 브라우저로 수행했고 임시 브라우저 인증 파일은 삭제했다. [Vercel 자동화 인증](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
- Vercel이 새 프로젝트의 최초 배포를 자동으로 production 기본 주소에 할당했다. 그 초기 배포는 학교 로그인 비밀이 없어 설치 대기 상태였고, 10월 9일 위 공개 운영 배포로 대체했다. 기존 별도 운영 프로젝트는 변경하지 않았다.
- 로컬 http://localhost:5178 도 `npm run dev:gas`의 학교별 연결 화면으로 전환했다.

## 로그인 후 조회 오류 보완 — 2026-10-09

최신 Preview에는 로그아웃 버튼의 눌림 효과, 회전 아이콘, `로그아웃 중…` 문구와 처리 중 비활성화 표시도 포함했다. 격리된 가상 학교 브라우저에서 요청을 보류해 표시를 확인하고, 요청 완료 후 로그인 화면과 완료 안내로 전환되는 것을 확인했다. 동작 줄이기 설정에서는 회전 없이 문구를 유지한다. 타입 검사와 빌드가 통과했으며 확인 결과와 화면은 로컬 `artifacts/logout-feedback-results.json`, `logout-pending.png`, `logout-complete.png`에 있다.

기존 Preview 로그에서 `/api/auth/login`의 200 응답과 `/api/admin/connection`, `/api/school/info`의 간헐적인 502 응답을 확인했다. 같은 조회 API가 이후 200을 반환했으므로 공개 접근 권한의 지속적인 차단은 확인되지 않았다. 과거 로그에는 실패 세부 원인이 없어 당시 시간 초과·통신 실패·JSON 파싱 실패 중 어느 것이었는지는 확정하지 못했다.

중계 서버는 학교 정보·세션·연결·계정 정보와 연수/참여 화면 조회에 한해서 일시적인 통신 실패, 시간 초과, 비JSON 응답 또는 일부 5xx/429 응답을 한 번 더 시도한다. 각 시도의 응답 제한은 25초이며, 인증 오류와 승인되지 않은 리디렉션은 재시도하지 않는다. 로그인 challenge/증명·계정 변경·연수/서명 저장·삭제 요청은 자동 재전송하지 않는다.

시간 초과는 `ERR-GAS-TIMEOUT`, 비JSON 응답은 `ERR-GAS-RESPONSE`, 통신 실패는 `ERR-GAS-NETWORK`로 구분한다. 서버 진단 로그에는 작업 종류·시도 횟수·실패 단계·상태 또는 소요 시간만 남긴다. 연결키·암호·쿠키·학교 URL·상류 응답 본문은 기록하지 않는다.

API·보안 검사 27개, 타입 검사, 빌드가 통과했으며 최종 재시도 범위 조정 후 관련 검사 4개도 통과했다. GAS 코드와 학교 자료는 변경하지 않았다. 이미 설치한 학교는 공개 운영 주소에서 **설치한 학교 접속**에 기존 `/exec` 주소를 넣고 기존 관리자 계정으로 로그인한다. 호스트가 달라 다시 로그인해야 하며 학교 설치를 반복할 필요는 없다. 실제 관리자 로그인 후 연수·서명 흐름의 재확인은 사용자가 이어서 수행해야 한다.

## 실제 Google 연동을 시작하는 방법

1. 공용 앱 첫 화면에서 **새 학교 설치**를 선택합니다.
2. **v5 GAS 코드 복사** 또는 **코드 내려받기**로 v5 코드를 받습니다. 저장소의 `Code.gs`와 `gas/TeacherSignV5.gs`도 같은 내용입니다. 학교 담당자의 Google 계정에서 새 Apps Script 프로젝트를 만들고 코드 전체를 한 파일에 붙여넣습니다. 기존 v4 보관본은 `gas/legacy/TeacherSignV4.gs`입니다.
3. `setupTeacherSign`을 실행하고 Google의 Drive·Sheets 권한 요청을 승인합니다. 실행 로그의 관리자 연결키를 보관합니다. 이 함수는 해당 설치 전용 폴더·연수 JSON·서명 시트·인증 파일을 생성합니다. 다시 실행해도 같은 파일 ID를 유지합니다.
4. 웹앱으로 새 배포합니다. 실행 사용자는 설치 담당자이며, 서버와 로그인하지 않은 참여자도 접근할 수 있어야 합니다. 조직에서 공개 웹앱 접근을 제한하면 조직 관리자에게 설치 가능 여부를 확인합니다. `/dev` 대신 `/exec` 주소를 사용합니다. [Google 배포·실행 권한](https://developers.google.com/apps-script/guides/web)
5. 앱의 설치 화면에 학교 이름·웹앱 주소·연결키를 입력하고 학교의 관리자 아이디·12자 이상 암호를 정합니다. 연결키와 암호는 채팅으로 보내지 말고 이 화면에서 입력합니다.
6. 계정 생성 후 이동한 `?school=<GAS 배포ID>` 주소를 학교 접속 링크로 저장합니다. 이후 다른 기기에서도 이 링크에서 로그인하면 같은 학교 자료를 불러옵니다.
7. 가상 연수를 등록하고 **링크 공유**의 QR로 다른 기기에서 서명합니다. QR에는 학교 ID·연수 ID·참여 토큰이 포함되며 관리자 연결키는 포함되지 않습니다.

다른 학교는 동일한 공용 앱에서 자신의 GAS를 새로 설치합니다. 같은 관리자 아이디를 선택해도 계정과 자료는 각 GAS 설치 범위에 속합니다. 각 학교가 별도의 Vercel 계정·Redis·DB 서비스에 가입할 필요는 없습니다.

## 개발 실행

```sh
# 기본 학교별 GAS 연결 화면
npm run dev

# 위 서버를 종료한 뒤 모의 화면: Google에 접속하지 않음
npm run dev:demo
```

두 명령 모두 http://localhost:5178 과 API 8787 포트를 사용하므로 동시에 실행하지 않습니다. 기본 `dev`와 같은 경로인 `dev:gas`는 주소·설정 입력 전에는 Google 요청을 보내지 않습니다. 로컬 쿠키 보호 키를 지정하지 않으면 실행마다 임시 키를 생성하므로 재시작 후 재로그인합니다. Vercel에는 고정된 서버 키를 사용합니다.

## Vercel 설정

시험 프로젝트: `leeseongkons-projects/teachersign-schools-test-20261003`.

- Vite 화면은 `dist`, Node API는 `api/gateway.mjs`입니다. `/api/*` 요청을 이 함수로 연결합니다. Node 24.x를 사용합니다.
- 서버 환경변수 `TEACHERSIGN_COOKIE_SECRET`: 무작위 32바이트를 64자리 소문자 hex로 표현한 값입니다. 시험 프로젝트의 **Preview Secret**과 별도의 **Production Secret**에 등록했습니다. 브라우저용 `VITE_` 환경변수로 만들지 않습니다.
- `TEACHERSIGN_ORIGIN`: 필요할 때 승인된 별도 도메인의 정확한 HTTPS Origin을 지정합니다. 기본적으로 Vercel의 배포 URL과 프로젝트 운영 URL을 사용합니다. 임의의 요청 Host를 신뢰하지 않습니다.
- 각 학교의 GAS 주소·관리자 연결키·암호를 Vercel 환경변수에 하나씩 등록하지 않습니다.
- 비밀 키가 없으면 로그인·설정 API가 닫히고 설치 준비 화면을 표시합니다. 모의 계정으로 대체하지 않습니다.
- `.vercelignore`로 로컬 모의 데이터, 환경 파일, 브라우저 결과, 테스트를 배포 업로드에서 제외합니다. 환경 파일과 `.vercel/`은 Git에서도 제외합니다.
- Preview와 배포별 주소의 접근 보호는 유지합니다. 공개 서명 링크는 위 고정 운영 주소에서 발급합니다. 참여자는 Vercel 계정이 필요 없으며, 관리자는 해당 학교의 앱 계정으로 로그인합니다.

## 구현과 검증 범위

학교 인증은 Node가 scrypt를 계산하고 GAS가 일회용 challenge의 HMAC 증명을 검증하는 방식입니다. GAS의 비공개 인증 파일에는 암호 검증값, 세션 토큰의 SHA-256 해시, 만료 정보, 로그인 시도 제한, 쓰기 요청 처리 결과를 보관합니다. 암호와 원본 세션 토큰은 그 파일에 저장하지 않습니다. 로그인 쿠키는 AES-GCM으로 보호하고 `HttpOnly`, `Secure`, `SameSite=Strict`를 적용합니다.

GAS 자체가 모든 학교 관리 요청의 세션과 CSRF를 검사합니다. Vercel 인스턴스 메모리에 로그인 상태를 두지 않습니다. 로그아웃·암호 변경 후에는 이전 쿠키도 사용할 수 없습니다. 다른 학교의 쿠키로 요청하는 것을 중계에서 거부하며 GAS도 자체 세션을 확인합니다. 비활동 만료는 30분, 최대 로그인 수명은 8시간입니다. 배경의 로그인 상태 확인은 비활동 시간을 연장하지 않습니다.

GAS ScriptLock으로 인증·연수·서명 작업을 직렬화하고 요청 ID를 통해 최근 5분의 성공한 쓰기 재시도를 처리합니다. Drive와 Sheets 전체에 걸친 데이터베이스 트랜잭션은 아니므로 중간 실패 때는 상태 확인과 같은 요청 재시도가 필요합니다. 로그인은 학교당 15분에 5회, 참여 요청은 학교당 분당 300회로 제한합니다. 시도 제한·처리 결과는 학교별 저장소에 유지합니다. 인증 파일은 비공개로 보관합니다.

공개 URL·리다이렉트는 Google의 지정된 HTTPS 경로만 허용하며 임의 URL로 중계하지 않습니다. GAS가 반환한 임의 오류 내용이나 비밀 값은 브라우저에 전달하지 않습니다. 교직원 서명 필드는 검증하고 Sheets의 수식으로 해석되지 않게 저장합니다.

실제 학교 GAS의 상태·학교 정보 조회와 공개 주소의 접근 제어를 검증했습니다. 연수·서명 저장과 동시 실행·Drive/Sheets 지연의 검증은 실제 v5 GAS 소스를 Node VM의 Drive/Sheets/Lock 모의 환경에서 실행한 결과이며, 실제 학교의 쓰기 작업은 별도 확인이 필요합니다. 공개 주소 전환은 완료했지만 실제 학교의 연수·서명 저장까지 검증됐다고 간주하지 않습니다. Google 실행·저장 할당량은 여전히 적용됩니다. [Google 할당량](https://developers.google.com/apps-script/guides/services/quotas)

```sh
npm run typecheck
npm run build
npm test
# 한 학교 모의 개발 서버 실행 후:
PLAYWRIGHT_BROWSERS_PATH=/tmp/teachersign-browser-runtime npm run test:browser
# 별도 모의 GAS 브라우저 서버 실행 후(실제 Google에 접속하지 않음):
node tests/school-browser-server.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/teachersign-browser-runtime node tests/school-browser.mjs
```

API·보안 검사 24개와 기존 모의 화면 검증 14개가 통과했습니다. 학교별 설치·계정·격리·QR·익명 서명 브라우저 검사 11개도 통과했습니다. 학교별 브라우저 결과는 `artifacts/school-browser-results.json`에 기록합니다. 테스트용 Google 대체 서버는 localhost:5179에서 실행하며 배포 패키지에 포함하지 않습니다.

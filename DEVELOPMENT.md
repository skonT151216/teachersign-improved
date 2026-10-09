# 개발·검증 안내

Vercel 시험 배포 기록은 [DEPLOYMENT.md](DEPLOYMENT.md), 인증과 자료 구성은 [DEPLOYMENT-DESIGN.md](DEPLOYMENT-DESIGN.md)를 참고하세요. 시험 Vercel 주소를 학교 운영용으로 사용하지 않습니다. 현재 v5는 별도 웹 화면·Node API가 필요하며, GAS 단독 화면 배포본은 아닙니다.

## 실행

Node.js 24.x와 npm을 사용합니다.

```sh
npm ci
npm run dev       # 학교별 GAS 연결 화면
npm run dev:gas   # 같은 실행 경로
```

화면은 http://localhost:5178, API는 `127.0.0.1:8787`입니다. `Ctrl+C`로 둘 다 종료합니다. 두 명령을 동시에 실행하지 않습니다. 학교를 연결하기 전에는 실제 Google 요청을 보내지 않습니다.

로컬 쿠키 보호 키를 지정하지 않으면 실행마다 임시 키를 생성하므로 재시작 후 다시 로그인합니다. 고정 키가 필요하면 Git에서 제외된 `.env.local`에 `TEACHERSIGN_COOKIE_SECRET`을 설정하고 `node --env-file=.env.local server/school-dev.mjs`로 실행합니다. 키는 무작위 32바이트를 64자리 소문자 hex로 표현합니다. 실제 연결키·암호·쿠키·학교 자료는 커밋하지 않습니다.

Google에 연결하지 않는 한 학교 모의 화면은 `npm run dev:demo`입니다. 같은 포트를 쓰므로 GAS 모드를 먼저 종료합니다. 가상 계정은 `demo-admin` / `DemoOnly-TeacherSign-2026!`이며 실제 학교나 Vercel 운영 API에서는 사용하지 않습니다. 모의 자료는 Git에서 제외된 `.teachersign-demo/state.json`에 보관합니다.

## API와 빌드

```sh
npm run typecheck
npm test
npm run build
```

`tests/school.test.mjs`는 기본 `Code.gs`를 Node VM에서 실행하고 Drive·Sheets·Properties·Lock·Utilities를 모의 구현으로 대체합니다. 같은 Google Drive에 설치한 두 학교의 파일·계정·세션 격리까지 검사합니다. `tests/security.test.mjs`는 기존 모의 HTTP API를 검사합니다. API·보안 27개와 업데이트 검사 4개가 통과했으며 실제 Google 권한 승인·저장 할당량 검증을 대신하지는 않습니다.

`Code.gs`와 `gas/TeacherSignV5.gs`는 같은 v5 내용입니다. 앱의 코드 복사와 GAS 모의 실행 검사는 `Code.gs`를 사용합니다. v5를 수정할 때 두 파일을 함께 갱신합니다. 기존 v4 원본은 `gas/legacy/TeacherSignV4.gs`에 있습니다.

업데이트 알림은 GitHub `main/version.json`의 안정 버전을 확인합니다. 배포할 때 `version.json`의 `appVersion`·`gasVersion`·게시일·변경 설명을 갱신하고, 화면 버전은 `package.json` 및 `package-lock.json`, GAS 버전은 두 코드 파일의 `SERVER_VERSION`과 맞춥니다. 버전은 숫자 세 부분(`5.0.1`) 형식입니다. 학교 URL·암호·연결키는 GitHub 조회에 보내지 않습니다. 다운로드 주소는 공식 저장소로 고정합니다.

## 브라우저

최초 한 번 `npx playwright install chromium`으로 격리 브라우저를 준비합니다. 별도 터미널에서 대상 서버를 실행합니다.

```sh
# 학교 A/B 모의 GAS: Google에 접속하지 않음, 화면 5179/API 8788
node tests/school-browser-server.mjs
# 다른 터미널에서
npm run test:browser:gas
```

가상 학교 설치·로그인·연수 등록·익명 모바일 서명·학교 전환·암호 변경·로그아웃을 검사합니다. 초기화는 이 별도 서버의 가상 자료만 지웁니다.

```sh
# 기존 한 학교 모의 화면 검사
npm run dev:demo
# 다른 터미널에서
npm run test:browser

# 검사할 운영 앱을 준비한 경우 TEACHERSIGN_PUBLIC_URL을 지정하여 실행
npm run test:browser:deployment
```

공개 배포 검사에는 `TEACHERSIGN_PUBLIC_URL` 지정이 필요합니다. 종료한 Vercel 시험 주소를 기본값으로 사용하지 않습니다. 보호된 Preview를 공개하거나 인증을 우회하지 않습니다. 결과·스크린샷은 Git에서 제외된 `artifacts/`에 보관합니다. 실제 학교의 연결키·암호·서명은 브라우저 검사에 사용하지 않습니다.

`.env*`, `.vercel/`, `artifacts/`, `.teachersign-demo/`, `node_modules/`, `dist/`는 커밋하지 않습니다. `npm run build`는 정적 화면을 생성하며 학교 인증 API는 Node 서버가 필요합니다. GitHub Pages나 단일 HTML만으로 운영하지 않습니다.

# 개발·검증 안내

일반 교사는 [GAS 설치 ZIP](https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-GAS.zip)의 두 파일을 Apps Script에 붙여넣습니다. 아래 Node 실행은 개발·검증 용도이며 운영용 서버는 없습니다.

## 빌드와 미리보기

Node.js 24.x와 npm을 사용합니다.

```sh
npm ci
npm run typecheck
npm test
npm run build:gas
npm run dev
```

GAS 빌드는 `gas-entry.tsx`·`vite.gas.config.ts`로 화면·스타일·엑셀·암호 계산 라이브러리를 단일 HTML에 포함합니다. `gas/standalone/Code.gs`, `Index.html`, 선택 매니페스트, 설치 안내, 라이선스 고지와 설치 ZIP을 생성합니다. 외부 JavaScript CDN 없이 실행하며 GitHub 업데이트 확인만 공개 네트워크를 사용합니다.

`npm run dev`는 두 가상 학교와 모의 Drive를 제공하는 GAS iframe 미리보기입니다. 최초 연결키는 콘솔에 표시되는 **가상 값**입니다. 실제 Google에 연결하지 않으며 재시작하면 가상 자료는 초기화됩니다. 포트는 기본 5178, `TEACHERSIGN_PREVIEW_PORT`로 변경합니다. 운영 학교의 URL·연결키·자료를 입력하지 않습니다.

## 브라우저

처음 한 번 `npx playwright install chromium`으로 격리 브라우저를 준비합니다.

```sh
npm run test:browser:standalone
```

이 검사는 자체 모의 GAS 서버를 실행·종료합니다. 설치 ZIP과 같은 HTML을 iframe에서 열고 `google.script.run`만 모의 전송으로 대체합니다. 학교별 설치, 실제 브라우저 scrypt, 엑셀 양식, 정규 /exec 링크·QR, 익명 모바일 캔버스 서명, 자료 유지, 계정 변경·세션 폐기, 로그아웃 표시, 업데이트 링크와 비밀의 브라우저 저장 금지를 검사합니다. 실제 Google 권한·할당량·Drive 지연 검사를 대신하지 않습니다.

## 배포 파일 관리

`Code.gs`가 원본입니다. `npm run build:gas`가 동일한 `gas/TeacherSignV5.gs`·`gas/standalone/Code.gs`와 빌드 HTML을 갱신합니다. 소스 변경 후 항상 빌드하고 결과를 함께 커밋합니다. 내부 GAS 함수는 이름 끝에 `_`를 붙입니다. 공개 브라우저 함수는 인증을 검사하는 `teacherSignRpc` 하나뿐입니다.

`version.json`의 `appVersion`·`gasVersion`·게시일·변경 설명을 갱신합니다. 화면 버전은 `package.json`·`package-lock.json`, 서버 버전은 `Code.gs`의 `SERVER_VERSION`과 맞춥니다. 숫자 세 부분(`5.1.0`) 형식입니다. 릴리스에 `TeacherSign-GAS.zip`을 첨부해야 화면의 설치 다운로드 링크가 작동합니다.

학교 URL·아이디·암호·연결키·세션은 GitHub 조회에 보내지 않습니다. 다운로드 주소는 공식 저장소로 고정합니다. 관리자 세션 토큰은 페이지 메모리에만 두므로 새로고침·창 닫기 후 다시 로그인합니다. 암호는 브라우저 scrypt로 계산하고 서버에는 일회용 HMAC 증명만 보내며 기존 v5 계정 형식과 호환됩니다.

## 과거 서버 시험 코드

`npm run dev:gateway`는 이전 Node 중계 시험판입니다. `npm run dev:demo`는 한 학교 가상 자료 시험판입니다. 기존 회귀 검사 `tests/school.test.mjs`, `tests/security.test.mjs`, `tests/school-browser.mjs`는 보관합니다. Vercel 시험 주소를 사용하거나 재배포하지 않습니다. `test:browser:deployment`는 명시한 `TEACHERSIGN_PUBLIC_URL`이 있어야 실행하는 별도 과거 도구입니다.

`.env*`, `.vercel/`, `artifacts/`, `.teachersign-demo/`, `node_modules/`, `dist/`, `.gas-build/`는 커밋하지 않습니다. 실제 학교 자료·쿠키·암호는 테스트와 공개 배포 파일에 넣지 않습니다.

## 공용 사이트 빌드

`npm run build:site`는 학교 GAS에 직접 연결하는 정적 화면을 dist에 빌드하고 artifacts/releases/TeacherSign-Site.zip을 만듭니다. Cloudflare Worker의 기존 teachersign 자산을 갱신할 때 사용합니다. Vercel도 같은 dist 정적 파일을 제공할 수 있으며 API Functions·추가 DB·서버 환경변수가 필요하지 않습니다. `npm run build:gas`는 별도의 학교 /exec용 단일 HTML과 설치 ZIP을 만듭니다.

두 빌드를 만든 뒤 `npm run test:browser:standalone`과 `npm run test:browser:hosted`로 같은 실제 GAS 코드의 인증·자료·서명 흐름을 각각 검증합니다. hosted 테스트는 공개 Google URL의 단순 POST를 가상 학교 HTTP 서버로 대체합니다. 실제 Google의 CORS·공개 정책·할당량은 운영 설치에서 별도 확인합니다.

# 공용 사이트 업데이트 · Cloudflare Worker teachersign

운영 주소는 https://teachersign.skonvibe.com, 기존 Worker는 `teachersign`, Worker 공개 주소는 https://teachersign.kingcurian15.workers.dev 입니다. 도메인 연결을 바꾸거나 새 Worker를 만들지 않고 기존 Worker의 화면 자산을 갱신합니다.

## 배포 파일

- `TeacherSign-Site.zip`: 공용 도메인 운영자용입니다. 압축을 풀면 최상위에 index.html, assets 폴더, _headers, version.json, 라이선스 안내가 있습니다.
- `TeacherSign-GAS.zip`: 각 학교 담당자용 Code.gs와 Index.html입니다. 학교 /exec에서 독립 실행합니다.

두 파일은 [최신 GitHub 릴리스](https://github.com/skonT151216/teachersign-improved/releases/latest)에서 받습니다. 소스 코드 ZIP은 빌드된 사이트 배포 ZIP과 다릅니다.

## 기존 Worker를 화면에서 갱신

Cloudflare에 로그인하고 **Workers 및 Pages → teachersign → 새 배포**를 엽니다. 현재 이 Worker는 **고정 파일을 업로드하여 Worker 업데이트** 화면을 사용합니다. **전체 내용**에서 `TeacherSign-Site.zip`을 선택하면 압축이 자동으로 풀립니다. `index.html`, `assets` 폴더, `version.json` 등이 포함된 **총 8개 파일**인지 확인한 뒤 **배포**를 누릅니다. 개요에 새 버전이 **준비되었습니다**로 표시되는지 확인합니다.

업로드 기능이 없는 다른 프로젝트라면 CLI 배포 또는 연결된 Git 빌드에서 자산을 갱신해야 합니다. 대시보드 기능과 표시 이름은 프로젝트 설정에 따라 다릅니다.

사이트 화면의 빌드 명령은 `npm run build:site`, 자산 디렉터리는 `dist`입니다. 연결된 Git 저장소가 이 저장소인지 확인합니다. 기존 Worker 이름과 맞춤 도메인을 유지합니다. 공개 화면만 제공하므로 계정·자료용 비밀 환경변수나 DB를 추가하지 않습니다.

## CLI에서 갱신

저장소의 wrangler.jsonc는 기존 Worker 이름과 dist 자산을 지정합니다. 이 파일에는 account_id·도메인 라우트·자격증명을 넣지 않습니다. 기존 운영 Worker를 소유한 Cloudflare 계정인지 확인한 뒤 실행합니다.

```sh
npm run build:site
npx wrangler whoami
npx wrangler deploy
```

인증되지 않았다면 소유자가 `npx wrangler login`으로 정상 로그인해야 합니다. GitHub에 토큰이나 OAuth 파일을 넣지 않습니다. 여러 계정이 표시되면 실제 teachersign Worker 소유 계정을 지정해야 합니다. 기존 Worker의 바인딩·라우트는 배포 전에 확인합니다.

## 배포 확인

1. 공용 도메인을 새로고침하면 v4 시작 화면 대신 학교 GAS 주소 연결 또는 학교 관리자 화면이 열립니다.
2. `/version.json`에서 appVersion 5.3.0을 확인합니다.
3. 해당 학교의 v5 /exec 주소를 연결합니다. 기존 v5 계정은 그대로 로그인하고 미설정 학교는 최초 계정을 만듭니다.
4. 가상 연수를 만들고 공용 도메인 QR로 로그인 없는 서명을 시험합니다. 학교 /exec에서도 같은 기록을 확인합니다.

사이트 ZIP을 업로드해도 각 학교의 GAS 코드나 Drive 자료는 바뀌지 않습니다. v4에서 전환하는 학교는 [자료 이전 안내](gas/standalone/v4자료이전.md)에 따라 원본을 확인한 뒤 복사본으로 연결합니다. 이전 도구는 학교 GAS에서 실행합니다. v5.3.0 화면에는 관리자용 기존 자료 연결 기능이 추가되어, /exec의 Index HTML과 공용 사이트 화면을 각각 갱신합니다.

공식 안내: [Cloudflare 정적 자산 시작](https://developers.cloudflare.com/workers/static-assets/get-started/), [Wrangler 설정](https://developers.cloudflare.com/workers/wrangler/configuration/).

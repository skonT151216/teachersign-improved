# 교직원 연수 등록부 도우미 v5.2.1 · 학교 GAS와 공용 사이트

각 학교의 **Google Apps Script와 Google Drive만으로** 설치·관리자 로그인·연수 관리·QR 서명을 제공합니다. 학교별 /exec 이용에는 별도 웹 서버·추가 DB 서비스가 필요하지 않습니다. 공용 도메인은 Cloudflare 또는 Vercel의 정적 화면에서 같은 학교 GAS에 직접 연결할 수 있습니다. 일반 교직원은 관리자 로그인 없이 학교 QR로 서명합니다.

**[GAS 설치 ZIP 다운로드](https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-GAS.zip)** · [상세 설치 안내](gas/standalone/설치안내.md) · [배포 파일 폴더](gas/standalone)

**[사진으로 따라 하는 교사용 매뉴얼](docs/교사용매뉴얼.md)** · [인쇄용 PDF](https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-Manual.pdf) · [오프라인 매뉴얼 ZIP](https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-Manual.zip)

**기존 v4 자료 이전은 [자료 이전 6단계 · 바로 읽기](https://github.com/skonT151216/teachersign-improved/blob/main/docs/자료이전_핵심안내.md)의 여섯 단계만 따라 하세요.** 설치 ZIP의 `사진매뉴얼/자료이전_핵심안내.html`로도 볼 수 있습니다.

새 설치, v4 자료 이전, v5 일반 업데이트, 교직원 QR 서명을 구분한 화면 안내입니다. 설치 ZIP에도 `사진매뉴얼/교사용매뉴얼.html`과 사진을 함께 넣었습니다. 압축을 모두 푼 뒤 HTML 파일을 열면 인터넷 없이 읽을 수 있습니다. 기존 v4 학교는 매뉴얼 8번 자료 이전을 먼저 확인하세요. 이전 후 수동 백업은 14번의 네 단계를 따르면 됩니다.

## 학교에 설치하기

**기존 v4 학교는 새 설치만으로 자료가 연결되지 않습니다.** [자료 이전 6단계 · 바로 읽기](https://github.com/skonT151216/teachersign-improved/blob/main/docs/자료이전_핵심안내.md)의 여섯 단계를 먼저 따라 하세요. v5.2.1은 원본과 현재 파일을 보존하고, 확인한 원본의 복사본으로 연결하는 이전 도구를 제공합니다. 이미 v5 자료가 있으면 덮어쓰지 않고 중단합니다. 화면 버전은 v5.2.1, GAS 서버 버전은 v5.2.1입니다.

1. 설치 ZIP을 내려받아 압축을 풉니다. 학교 담당자의 Google 계정으로 [Apps Script](https://script.google.com)에서 새 프로젝트를 만듭니다.
2. 기본 **Code.gs** 내용을 ZIP의 **Code.gs**로 교체합니다.
3. **파일 + → HTML → Index**를 만들고 ZIP의 **Index.html** 전체 내용을 붙여넣습니다. 이름은 대문자 I로 시작하는 **Index**입니다.
4. **저장** 후 실행 함수에서 **setupTeacherSign**(끝에 밑줄 없음)을 선택해 실행하고 Drive·Sheets·설치 계정 확인 권한을 승인합니다. 실행 로그의 **관리자 연결키**를 따로 보관합니다.
5. **배포 → 새 배포 → 웹 앱**, **실행 사용자: 나**, **액세스 권한: 모든 사용자**로 배포합니다. 학교 Workspace 정책이 Google 로그인 없는 웹앱을 허용해야 합니다.
6. **/exec 주소**를 엽니다. 학교 관리자 최초 설정 화면에서 학교 이름·연결키·관리자 아이디·12자 이상 암호를 정합니다.
7. 관리자 아이디·암호로 로그인해 명단과 연수를 등록하고 **링크 공유**에서 학교 QR을 발급합니다.

ZIP의 `appsscript.json`으로 매니페스트를 직접 설정했다면 이번 파일로 함께 교체합니다. 설치 계정 확인에 필요한 `userinfo.email` 권한이 추가되었습니다. 자동 권한 설정을 사용한다면 별도 편집은 필요하지 않습니다. 교사는 npm·Node 설치 없이 ZIP의 두 파일을 붙여넣으면 됩니다. `/exec`는 화면을 열며 서버 상태 JSON은 `/exec?action=healthCheck`로 확인합니다. Google 권한 승인은 설치 담당자가 한 번 진행하고, 참여 교직원에게 Drive 권한이나 Vercel 계정을 요구하지 않습니다.

## 공용 도메인에서 이용

[teachersign.skonvibe.com](https://teachersign.skonvibe.com)은 Cloudflare Worker `teachersign`의 공용 화면입니다. 사이트 운영자가 **[사이트 배포 ZIP](https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-Site.zip)**으로 화면을 업데이트한 뒤, 각 학교의 GAS /exec 주소를 연결합니다. 관리자 계정·세션·연수·서명은 해당 학교의 GAS/Drive에 보관합니다. Vercel 로그인이나 별도 DB는 요구하지 않습니다.

공용 사이트에서 만든 QR은 공용 도메인과 학교 GAS 주소를 함께 담습니다. GAS /exec에서 만든 QR은 해당 /exec로 연결됩니다. 같은 학교 자료와 관리자 계정으로 양쪽에서 사용할 수 있습니다. 브라우저에는 학교 공개 주소만 저장하고 관리자 비밀번호·세션은 저장하지 않습니다.

[Cloudflare 운영 사이트 업데이트 안내](CLOUDFLARE.md)

## 기존 v5 시험 설치에서 전환

**동일 GAS 프로젝트**의 Code.gs를 교체하고 Index HTML을 추가한 뒤 **배포 관리 → 기존 배포 수정 → 새 버전**으로 배포합니다. 기존 /exec 주소·스크립트 속성·Drive 파일 ID를 유지하면 계정과 연수·서명 자료를 계속 사용합니다. 관리자 계정을 다시 만들지 않습니다.

이전 Vercel 시험 주소를 이용하지 않습니다. 예전 Vercel QR은 GAS /exec 주소에서 다시 발급합니다. v4 원본은 [gas/legacy/TeacherSignV4.gs](gas/legacy/TeacherSignV4.gs)에 있습니다. 기존 v4 학교는 [자료 이전 절차](gas/standalone/v4자료이전.md)로 연수와 별도 서명 시트를 확인해 연결합니다. 같은 이름의 첫 파일을 자동 선택하지 않습니다.

## 담당자의 업데이트 확인

로그인 후 **서버 연결 설정 → 프로그램 업데이트**에서 현재 화면·GAS 버전과 GitHub 최신 버전을 비교합니다. 변경 내용, 저장소, 설치 ZIP 링크를 제공합니다. 통신 실패를 최신 상태로 표시하지 않습니다.

업데이트 ZIP의 **Code.gs와 Index HTML을 함께 교체**하고 기존 배포를 새 버전으로 수정합니다. 스크립트 속성·Drive 파일을 지우거나 계정을 다시 만들지 않습니다. 업데이트는 자동 설치되지 않습니다. 요청 버전 1을 유지하는 GAS 서버 수정은 GAS만 갱신할 수 있습니다. 화면 수정은 /exec의 Index HTML 또는 공용 사이트 배포에도 반영해야 하며, 요청 형식 변경은 양쪽을 함께 업데이트합니다.

## 개발·검증

개발자만 Node.js 24.x가 필요합니다.

```sh
npm ci
npm run build:gas
npm run dev
```

`npm run build:gas`는 [gas/standalone](gas/standalone)의 설치 파일과 `artifacts/releases/TeacherSign-GAS.zip`을 생성합니다. `npm run dev`는 Google에 접속하지 않는 가상 학교의 GAS 화면 미리보기입니다. 실제 운영은 각 학교의 GAS /exec 주소에서 실행합니다.

API·보안·계정 호환 검사, GAS iframe 화면의 설치·로그인·엑셀 양식·QR·익명 모바일 서명·계정 변경·로그아웃·학교별 격리를 검증합니다. 실제 Google 권한·할당량·동시 서명은 학교 담당자가 가상 자료로 최종 확인합니다. [개발 안내](DEVELOPMENT.md) · [구성과 검증 범위](DEPLOYMENT-DESIGN.md) · [v4·v5 안정성 검토와 남은 보완 사항](docs/안정성검토.md)

# 교직원 연수 등록부 도우미 v5.1 · GAS 단독 배포

각 학교의 **Google Apps Script와 Google Drive만으로** 설치·관리자 로그인·연수 관리·QR 서명을 제공합니다. Vercel·별도 웹 서버·추가 DB 서비스는 필요하지 않습니다. 일반 교직원은 관리자 로그인 없이 학교 QR로 서명합니다.

**[GAS 설치 ZIP 다운로드](https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-GAS.zip)** · [상세 설치 안내](gas/standalone/설치안내.md) · [배포 파일 폴더](gas/standalone)

## 학교에 설치하기

1. 설치 ZIP을 내려받아 압축을 풉니다. 학교 담당자의 Google 계정으로 [Apps Script](https://script.google.com)에서 새 프로젝트를 만듭니다.
2. 기본 **Code.gs** 내용을 ZIP의 **Code.gs**로 교체합니다.
3. **파일 + → HTML → Index**를 만들고 ZIP의 **Index.html** 전체 내용을 붙여넣습니다. 이름은 대문자 I로 시작하는 **Index**입니다.
4. 실행 함수에서 **setupTeacherSign_**을 선택해 실행하고 Drive·Sheets 권한을 승인합니다. 실행 로그의 **관리자 연결키**를 따로 보관합니다.
5. **배포 → 새 배포 → 웹 앱**, **실행 사용자: 나**, **액세스 권한: 모든 사용자**로 배포합니다. 학교 Workspace 정책이 Google 로그인 없는 웹앱을 허용해야 합니다.
6. **/exec 주소**를 엽니다. 학교 관리자 최초 설정 화면에서 학교 이름·연결키·관리자 아이디·12자 이상 암호를 정합니다.
7. 관리자 아이디·암호로 로그인해 명단과 연수를 등록하고 **링크 공유**에서 학교 QR을 발급합니다.

교사는 npm·Node 설치 없이 ZIP의 두 파일을 붙여넣으면 됩니다. `/exec`는 화면을 열며 서버 상태 JSON은 `/exec?action=healthCheck`로 확인합니다. Google 권한 승인은 설치 담당자가 한 번 진행하고, 참여 교직원에게 Drive 권한이나 Vercel 계정을 요구하지 않습니다.

## 기존 v5 시험 설치에서 전환

**동일 GAS 프로젝트**의 Code.gs를 교체하고 Index HTML을 추가한 뒤 **배포 관리 → 기존 배포 수정 → 새 버전**으로 배포합니다. 기존 /exec 주소·스크립트 속성·Drive 파일 ID를 유지하면 계정과 연수·서명 자료를 계속 사용합니다. 관리자 계정을 다시 만들지 않습니다.

이전 Vercel 시험 주소를 이용하지 않습니다. 예전 Vercel QR은 GAS /exec 주소에서 다시 발급합니다. v4 자료를 v5로 자동 이전하는 기능은 없으므로 기존 v4 운영 프로젝트는 보관하고 새 프로젝트로 설치합니다. v4 원본은 [gas/legacy/TeacherSignV4.gs](gas/legacy/TeacherSignV4.gs)에 있습니다.

## 담당자의 업데이트 확인

로그인 후 **서버 연결 설정 → 프로그램 업데이트**에서 현재 화면·GAS 버전과 GitHub 최신 버전을 비교합니다. 변경 내용, 저장소, 설치 ZIP 링크를 제공합니다. 통신 실패를 최신 상태로 표시하지 않습니다.

업데이트 ZIP의 **Code.gs와 Index HTML을 함께 교체**하고 기존 배포를 새 버전으로 수정합니다. 스크립트 속성·Drive 파일을 지우거나 계정을 다시 만들지 않습니다. 업데이트는 자동 설치되지 않습니다.

## 개발·검증

개발자만 Node.js 24.x가 필요합니다.

```sh
npm ci
npm run build:gas
npm run dev
```

`npm run build:gas`는 [gas/standalone](gas/standalone)의 설치 파일과 `artifacts/releases/TeacherSign-GAS.zip`을 생성합니다. `npm run dev`는 Google에 접속하지 않는 가상 학교의 GAS 화면 미리보기입니다. 실제 운영은 각 학교의 GAS /exec 주소에서 실행합니다.

API·보안·계정 호환 검사, GAS iframe 화면의 설치·로그인·엑셀 양식·QR·익명 모바일 서명·계정 변경·로그아웃·학교별 격리를 검증합니다. 실제 Google 권한·할당량·동시 서명은 학교 담당자가 가상 자료로 최종 확인합니다. [개발 안내](DEVELOPMENT.md) · [구성과 검증 범위](DEPLOYMENT-DESIGN.md)

# 교사용 화면 매뉴얼 관리

[교사용매뉴얼.md](교사용매뉴얼.md)는 GitHub에서 읽는 원본입니다. `교사용매뉴얼.html`은 같은 내용을 사진과 함께 인터넷 없이 여는 파일이며 `images/` 폴더가 필요합니다. `npm run build:manual`은 원본에서 HTML·PDF·매뉴얼 ZIP을 만듭니다. Playwright Chromium이 준비된 개발 환경에서 실행합니다. `npm run build:gas`는 검토된 HTML·Markdown·사진을 설치 ZIP의 `사진매뉴얼/`에 포함합니다.

`자료이전_핵심안내.html`과 `TeacherSign-Migration-Quick.pdf`는 원본 매뉴얼의 8번에서 같은 내용으로 생성하는 한 장 안내입니다. 기존 자료 찾기부터 배포 갱신까지 여섯 단계만 담습니다. 이 안내를 수정할 때도 원본 8번을 수정하고 다시 생성합니다.

매뉴얼은 v5.2.1 기준이며 2026-10-10에 다음 화면을 확인했습니다.

| 사진 | 출처 |
| --- | --- |
| editor-files, editor-run | 실제 Google Apps Script의 파일 추가·실행 도구 모음 |
| deploy-menu, deploy-type, deploy-access, deploy-edit, deploy-version | 실제 Google Apps Script의 배포·수정 메뉴. 촬영을 위해 운영 배포를 실행하지 않음 |
| properties-add | 실제 Google Apps Script의 스크립트 속성 추가 버튼. 실제 속성 값을 촬영하거나 변경하지 않음 |
| account-setup, account-login, admin-dashboard, training-share, participant-list, participant-sign, participant-done, program-updates, school-connect | 저장소의 v5.2.1 코드와 가상 GAS/Drive 학교를 로컬에서 실행하여 촬영한 프로그램 화면 |

사진에는 실제 운영 계정 주소·파일 ID·관리자 연결키·학교 명단·서명 이미지를 넣지 않습니다. 예시 QR은 실행이 종료되는 로컬 가상 학교로 연결하므로 접속용으로 사용하지 않습니다. 권한 승인 화면은 학교 계정과 정책에 따라 달라 공통 흐름을 글로 안내합니다.

업데이트 시 실제 메뉴·함수 이름·정상 결과·오류 조건·이전 보호 기능을 코드와 대조하고, 화면 변경은 새 가상 사진으로 반영합니다. 목차와 본문의 단계 번호를 함께 고칩니다. PDF 인쇄 결과, 모바일 HTML, 이미지·목차 링크, ZIP 무결성, 개인정보 노출을 확인한 뒤 공개합니다. 운영 자료를 사용해 문서 촬영을 위해 이전 함수를 다시 실행하지 않습니다.

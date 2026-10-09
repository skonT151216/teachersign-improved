# GAS 단독 배포 구성과 검증 범위

2026-10-09, v5.1.1. 화면·인증·연수·서명 처리는 학교별 GAS 웹앱에서 실행합니다. 추가 Vercel·Node 서버·Redis·DB 서비스는 사용하지 않습니다. 과거 중계 시험 기록은 [DEPLOYMENT.md](DEPLOYMENT.md)에 보관합니다.

| 기능 | 위치 |
| --- | --- |
| 로그인·관리·서명·엑셀·QR 화면 | 해당 학교 GAS HtmlService의 Index HTML |
| 화면 → 서버 통신 | Google의 google.script.run → teacherSignRpc |
| 학교 자료·계정·세션·시도 제한·쓰기 요청 ID | 해당 프로젝트의 비공개 Drive JSON/Sheets |
| 파일 연결 | 해당 프로젝트 ScriptProperties의 전용 폴더·파일 ID |
| 암호 계산 | 브라우저의 scrypt N32768/r8/p3, 기존 v5 검증값과 호환 |
| 인증 판정·세션 폐기·CSRF·권한 검사 | GAS, ScriptLock으로 직렬화 |
| 업데이트 안내와 설치 ZIP | 공개 GitHub의 version.json 및 최신 릴리스 |

## 인증과 권한

Google 설치 계정과 학교 앱 관리자 계정은 별개입니다. 설치 담당자가 Drive·Sheets·설치 계정 확인 권한을 승인하고 웹앱을 나로 실행하도록 배포합니다. 관리자는 학교 앱 계정으로 로그인하며, 일반 참여자는 Google·관리자 로그인 없이 QR 토큰·선택 인증번호를 검증받습니다.

편집기에서 선택할 설치 진입점 `setupTeacherSign`은 Google의 현재 사용자와 실행 권한 사용자 이메일이 모두 존재하고 일치할 때만 저장소를 준비합니다. `실행 사용자: 나`인 공개 웹앱에서 익명 방문자나 다른 사용자는 거절합니다. 연결키는 설치 실행 로그에만 출력하고 이 공개 함수의 반환값에 포함하지 않습니다. [Google Session 사용자 확인](https://developers.google.com/apps-script/reference/base/session)에 따른 권한 확인이며 참여자 서명에는 Google 로그인을 요구하지 않습니다.

내부 GAS 함수는 `_`로 끝나 브라우저에서 직접 호출할 수 없습니다. 공개 RPC는 작업 허용 목록과 요청 크기를 검사하고, 관리자 요청은 저장된 세션과 CSRF를 검사합니다. 최초 계정 설정에는 설치 담당자의 연결키가 필요하며 이미 있는 계정을 덮어쓰지 않습니다.

암호 원문은 RPC로 보내거나 보관하지 않습니다. 브라우저 scrypt와 일회용 HMAC 증명은 기존 v5 Node 시험판과 같은 바이트 형식을 사용합니다. 학교·계정 버전별 challenge는 60초, 한 번만 사용합니다. 로그인을 15분 동안 5회로 제한합니다. 계정 변경은 현재 암호 증명이 필요하며 해당 학교의 기존 세션·challenge를 모두 폐기합니다.

원시 세션 토큰은 페이지 메모리에만 보관하고, GAS에는 토큰의 SHA-256 해시를 저장합니다. 쿠키·localStorage·sessionStorage·URL에 관리자 자격을 넣지 않습니다. 새로고침·창 닫기 후에는 다시 로그인합니다. 로그인 세션은 30분간 관리 요청이 없거나 8시간이 지나면 종료됩니다. 배경 세션 조회는 비활동 제한을 연장하지 않습니다.

## 학교 격리와 링크

각 프로젝트가 자신의 파일 ID를 보관하며 이름이 같은 다른 학교 파일을 검색하지 않습니다. 브라우저의 학교 ID·URL·함수명이 저장소를 선택하지 못합니다. 화면에 넣는 값은 정규 /exec 주소·스크립트 ID·공개 버전·허용한 참여 쿼리뿐이며 HTML 구문을 이스케이프합니다. 관리자 키·계정 검증값·자료를 초기 HTML에 넣지 않습니다.

HtmlService 화면은 Google iframe 안에서 실행되므로 화면의 location 주소 대신 ScriptApp의 실제 웹앱 주소를 공유합니다. 참여 링크는 해당 학교 /exec 주소·연수 ID·토큰으로 구성하며 관리자 연결키는 포함하지 않습니다. 기존 Vercel QR은 GAS에서 다시 발급합니다.

## 자료와 호환

기존 v5 설치는 동일 프로젝트에서 Code.gs 교체·Index HTML 추가·기존 배포 새 버전 수정으로 전환합니다. 기존 속성·파일·계정 검증값을 유지합니다. 자동 v4 자료 마이그레이션은 제공하지 않으며 v4 운영 프로젝트를 덮어쓰지 않습니다.

GAS ScriptLock은 동시 갱신을 보호하고 최근 쓰기 ID를 5분 동안 보관해 중복 적용을 방지합니다. Drive JSON과 Sheets 간 저장은 하나의 원자적 트랜잭션이 아닙니다. 이미지 크기·형식과 서명 필드를 검사하고 Sheets 수식 주입을 이스케이프합니다. 관리자는 실제 운영 전 가상 연수로 저장·조회·동시 서명을 검증합니다.

## 검증의 한계

Node VM에서 실제 Code.gs를 실행하고 Google Drive/Sheets/Properties/Lock/Utilities를 모의 구현으로 대체합니다. 브라우저에서는 배포 HTML을 GAS와 같은 iframe 제한으로 실행하고 RPC 전송만 모의 구현으로 대체합니다. 실제 Google 계정의 권한 승인·조직 공개 정책·Drive 지연·서비스 할당량과 모바일 Google iframe의 최종 동작은 실제 설치 후 확인해야 합니다. 설치 계정의 Google 실행·저장 할당량을 사용하며 무제한 처리를 보장하지 않습니다.

공식 근거: [HtmlService 통신과 비공개 함수](https://developers.google.com/apps-script/guides/html/communication), [iframe 제한](https://developers.google.com/apps-script/guides/html/restrictions), [웹앱 실행 권한](https://developers.google.com/apps-script/guides/web), [서비스 할당량](https://developers.google.com/apps-script/guides/services/quotas).

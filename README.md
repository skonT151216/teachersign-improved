<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 교직원 연수 등록부 서명 도우미 v4.0

교직원은 별도 로그인 없이 QR 링크로 접속해 당일 여러 연수에 한 번 서명하고, 담당자는 연수별 등록부를 취합·출력할 수 있습니다.

View your app in AI Studio: https://ai.studio/apps/6c7c8583-2c2d-41f3-b8d6-da92ff71c3f2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) Set up Google Sheets/Apps Script cloud sync from the in-app "구글 드라이브 연동" admin screen — no `.env` configuration is required for local-only use.
3. Run the app:
   `npm run dev`

## v4.0 Google 연동 업데이트

기존 연동 사용자는 관리자 화면의 `구글 연동 설정`에서 다음 순서로 업데이트합니다.

1. 화면의 v4.0 Apps Script 코드를 복사해 기존 코드를 교체합니다.
2. Apps Script에서 `setupTeacherSign` 함수를 한 번 실행하고 실행 로그의 관리자 연결키를 복사합니다.
3. 웹앱을 새 버전으로 배포합니다. 실행 사용자는 `나`, 액세스 권한은 `모든 사용자`로 설정합니다.
4. 웹앱 URL과 관리자 연결키를 입력하고 연동 테스트를 통과한 뒤 저장합니다.
5. 기존 QR을 폐기하고 관리자 화면에서 새 참여 링크 또는 QR을 공유합니다.

관리자 연결키는 담당자 기기에만 저장되며 참여 링크에는 포함되지 않습니다. 참여자는 Google 로그인 없이 서명할 수 있습니다.

import React from 'react';

export default function SetupGuide() {
  return <div className="space-y-4 text-sm text-gray-700">
    <p className="rounded-lg bg-amber-50 border border-amber-200 p-3">현재는 설정 과정을 확인하는 개발 미리보기입니다. 가상 예시만 사용하며 실제 Google 권한 승인·계정 생성은 하지 않습니다.</p>
    <ol className="list-decimal pl-5 space-y-3">
      <li><strong>학교별 Google 저장소 준비</strong><p>각 학교 설치 담당자의 Google 계정으로 Apps Script를 복사하고 setupTeacherSign을 실행하여 해당 학교의 Drive·Sheets 권한을 승인합니다.</p></li>
      <li><strong>학교 연결 등록</strong><p>해당 학교의 Apps Script 웹앱 주소와 관리자 연결키로 최초 연결을 확인합니다. 학교마다 자신의 저장소를 사용하며, 연결키는 학교 담당자만 보관합니다.</p></li>
      <li><strong>학교별 앱 관리자 계정 설정</strong><p>공개 배포본에서는 학교별로 관리자 아이디와 암호를 설정하는 구성을 준비하고 있습니다. 현재 개발본에서는 가상 계정으로 설정 흐름만 확인할 수 있습니다. 관리자 연결키와 앱 로그인 암호는 다른 값입니다.</p></li>
      <li><strong>학교 링크로 계속 사용</strong><p>공개 배포본은 학교를 구분하는 접속 링크와 참여 QR을 제공하는 구성을 준비하고 있습니다. 로그아웃 후에도 해당 학교의 연결과 기록을 유지하고, 참여자는 관리자 로그인 없이 서명하는 방식입니다. 현재 개발본은 한 학교의 모의 데이터만 사용합니다.</p></li>
    </ol>
    <p className="border-t pt-3">Google 권한 승인은 최초 설치 담당자가 진행합니다. 매번 앱에 로그인할 때 Google 계정으로 로그인하는 구조는 아닙니다.</p>
  </div>;
}

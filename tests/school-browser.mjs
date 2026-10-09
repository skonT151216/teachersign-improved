import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://localhost:5179";
const A = "BROWSER_SCHOOL_A_0001",
  B = "BROWSER_SCHOOL_B_0002";
const password = "Browser-Fictional-Password-2026!";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const checks = [],
  errors = [],
  forbidden = [],
  adminFailures = [];
let updateResponse = { appVersion: '5.3.0', gasVersion: '5.3.0', publishedAt: '2026-10-09', notes: '가상 업데이트 안내' };
let updateStatus = 200;
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", response => { if (response.url().includes("/api/admin/") && response.status() >= 400) adminFailures.push({ url: response.url(), status: response.status() }); });
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'raw.githubusercontent.com') {
    assert.equal(url.pathname, '/skonT151216/teachersign-improved/main/version.json');
    return route.fulfill({ status: updateStatus, contentType: 'application/json', body: JSON.stringify(updateResponse) });
  }
  if (url.hostname !== "localhost" && url.protocol !== "data:") {
    if (
      url.hostname.includes("script.google") ||
      url.hostname.includes("accounts.google") ||
      url.hostname.includes("qrserver")
    )
      forbidden.push(url.hostname);
    return route.fulfill({ status: 200, body: "" });
  }
  return route.continue();
});
const pass = (label) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};
async function login(secret = password, username = "same-admin") {
  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page.getByLabel("암호", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "관리자 대시보드" }).waitFor();
}
async function install(id, label) {
  await page.goto(base);
  await page.getByRole("button", { name: "새 학교 설치", exact: true }).click();
  await page
    .getByLabel("학교 GAS 웹앱 주소", { exact: true })
    .fill(`https://script.google.com/macros/s/${id}/exec`);
  await page.getByLabel("학교 이름", { exact: true }).fill(label);
  await page
    .getByLabel("학교 관리자 연결키", { exact: true })
    .fill("Browser-Demo-Only-Setup-Key-2026!000");
  await page.getByLabel("관리자 아이디", { exact: true }).fill("same-admin");
  await page.getByLabel("새 암호", { exact: true }).fill(password);
  await page.getByLabel("새 암호 확인", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "학교 관리자 계정 만들기", exact: true })
    .click();
  await page.waitForURL(`**/?school=${id}`);
  await page.getByRole("heading", { name: `${label} 관리자 로그인` }).waitFor();
}
try {
  const reset = await context.request.post("http://127.0.0.1:8788/__reset-fixtures");
  assert.equal(reset.status(), 200);
  assert.deepEqual(await reset.json(), {});
  await install(A, "가상 학교 A");
  pass("School A onboarding redirects to its own login link");
  await login();
  pass("School A admin login and dashboard");
  await page
    .getByRole("button", { name: "서버 연결 설정", exact: true })
    .click();
  const link = await page
    .getByLabel("학교 접속 링크", { exact: true })
    .inputValue();
  assert.ok(link.endsWith(`?school=${A}`));
  await page.screenshot({
    path: "artifacts/school-connected.png",
    fullPage: true,
  });
  pass("Persistent connection screen shows a shareable school link");
  await page.getByRole('button', { name: '프로그램 업데이트', exact: true }).click();
  await page.getByText('새 업데이트가 있습니다.', { exact: true }).waitFor();
  assert.equal(await page.getByText('학교 GAS 버전: v5.2.0', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('link', { name: '최신 프로그램 ZIP 다운로드', exact: true }).getAttribute('href'), 'https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-GAS.zip');
  await page.screenshot({ path: 'artifacts/school-updates.png', fullPage: true });
  pass('Administrator sees newer frontend/GAS versions and the official GitHub download');
  updateResponse = { ...updateResponse, appVersion: '5.2.0', gasVersion: '5.2.0' };
  await page.getByRole('button', { name: '업데이트 확인', exact: true }).click();
  await page.getByText('현재 화면과 학교 GAS는 최신 버전 이상입니다.', { exact: true }).waitFor();
  pass('Update check distinguishes an up-to-date school installation');
  updateStatus = 503;
  await page.getByRole('button', { name: '업데이트 확인', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '최신 버전을 확인하지 못했습니다.' }).waitFor();
  assert.equal(await page.getByText('현재 화면과 학교 GAS는 최신 버전 이상입니다.', { exact: true }).count(), 0);
  updateStatus = 200;
  pass('GitHub failure clears stale version status and keeps the download available');
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  await page.getByText("🏢 외부공개", { exact: true }).click();
  await page
    .getByPlaceholder("연수명", { exact: true })
    .fill("학교 A 서명 시험");
  await page.getByPlaceholder("기관명", { exact: true }).fill("가상 학교 A");
  await page.locator("input[type=date]").fill("2026-10-03");
  await page.getByRole("button", { name: "연수 등록", exact: true }).click();
  await page
    .getByRole("heading", { name: "학교 A 서명 시험" })
    .waitFor();
  await page
    .getByRole("button", { name: "링크 공유", exact: true })
    .first()
    .click();
  await page.locator("img[alt=QR]").waitFor();
  const participantLink = await page.locator("input[readonly]").inputValue();
  assert.equal(new URL(participantLink).searchParams.get("school"), A);
  assert.ok(!participantLink.includes("Browser-Demo-Only"));
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  pass(
    "Training creation generates a local QR bound to school A without an admin key",
  );
  const participantContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const participant = await participantContext.newPage();
  participant.on("pageerror", (e) => errors.push(e.message));
  await participantContext.route("**/*", async (route) => {
    if (new URL(route.request().url()).hostname !== "localhost")
      return route.fulfill({ status: 200, body: "" });
    return route.continue();
  });
  await participant.goto(participantLink);
  await participant
    .getByPlaceholder("소속 입력", { exact: true })
    .fill("가상 소속");
  await participant
    .getByPlaceholder("직위 입력", { exact: true })
    .fill("가상 직위");
  await participant
    .getByPlaceholder("성명 입력", { exact: true })
    .fill("가상 참여자");
  assert.equal(
    await participant
      .getByRole("button", { name: "로그아웃", exact: true })
      .count(),
    0,
  );
  await participant
    .getByRole("button", { name: "확인 및 서명", exact: true })
    .click();
  await participant.getByRole("button", { name: "출장", exact: true }).click();
  await participant
    .getByRole("button", { name: "서명 완료", exact: true })
    .click();
  await participant
    .getByText("가상 참여자님 서명 전송 완료.", { exact: true })
    .waitFor();
  await participant.screenshot({
    path: "artifacts/school-mobile-signature.png",
    fullPage: true,
  });
  await participantContext.close();
  pass("Anonymous mobile participant uses the school QR and saves a signature");
  const rows = await page.evaluate(async (school) => {
    const session = await fetch(`/api/auth/session?school=${school}`).then(
      (r) => r.json(),
    );
    return fetch(`/api/admin/action?school=${school}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrf,
      },
      body: JSON.stringify({ action: "getAdminSessions" }),
    }).then((r) => r.json());
  }, A);
  assert.equal(rows.data[0].signatures.length, 1);
  const stolen = await context.cookies();
  await page.goto(`${base}/?school=${B}`);
  await page.getByRole("heading", { name: "학교 관리자 로그인" }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "관리자 대시보드" }).count(),
    0,
  );
  pass("School A cookie cannot open school B dashboard");
  await install(B, "가상 학교 B");
  await login();
  pass("School B can independently use the same administrator ID");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByRole("heading", { name: "가상 학교 B 관리자 로그인" })
    .waitFor();
  await page.goto(`${base}/?school=${A}`);
  await login();
  await page.getByRole("button", { name: "관리자 계정", exact: true }).click();
  await page.getByLabel("관리자 아이디", { exact: true }).fill("changed-admin");
  await page.getByLabel("현재 암호", { exact: true }).fill(password);
  await page
    .getByLabel("새 암호", { exact: true })
    .fill("New-Browser-Fictional-Password!");
  await page
    .getByLabel("새 암호 확인", { exact: true })
    .fill("New-Browser-Fictional-Password!");
  await page.getByRole("button", { name: "계정 변경", exact: true }).click();
  await page
    .getByRole("button", { name: "변경하고 다시 로그인", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "가상 학교 A 관리자 로그인" })
    .waitFor();
  pass("Actual account-change form revokes the session and returns to login");
  await login("New-Browser-Fictional-Password!", "changed-admin");
  await page
    .getByRole("button", { name: "서버 연결 설정", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("학교 접속 링크", { exact: true }).inputValue(),
    link,
  );
  pass("School connection survives account change and login");
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByRole("heading", { name: "가상 학교 A 관리자 로그인" })
    .waitFor();
  await context.addCookies(stolen);
  await page.reload();
  await page
    .getByRole("heading", { name: "가상 학교 A 관리자 로그인" })
    .waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "관리자 대시보드" }).count(),
    0,
  );
  pass("Old cookie cannot restore an expired school account session");
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  assert.deepEqual(storage, { local: [], session: [] });
  pass("No school key or records stored in browser persistent storage");
  await page.screenshot({ path: "artifacts/school-login.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(adminFailures, []);
  assert.deepEqual(forbidden, []);
  await writeFile(
    "artifacts/school-browser-results.json",
    JSON.stringify({ passed: true, checks, errors, forbidden, adminFailures }, null, 2),
  );
} catch (e) {
  await page.screenshot({
    path: "artifacts/school-browser-failure.png",
    fullPage: true,
  });
  await writeFile(
    "artifacts/school-browser-results.json",
    JSON.stringify(
      { passed: false, checks, errors, forbidden, failure: e.message },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}

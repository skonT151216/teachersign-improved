import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { hashPassword } from '../server/auth.mjs';
import { createStandaloneFixture } from './gas-standalone-fixture.mjs';
import { createLegacyGasHarness } from './legacy-gas-harness.mjs';

await mkdir('artifacts', { recursive: true });
await mkdir('docs/images', { recursive: true });
const fixture = await createStandaloneFixture();
const legacy = new Map(['A', 'B'].map(id => [id, createLegacyGasHarness(id)]));
const endpoint = id => `https://script.google.com/macros/s/LegacyHostedFixtureSchool${id}/exec`;
const configKey = 'training_app_cloud_config';
const urlKey = 'teachersign_school_url_v5';
const calls = [], checks = [], errors = [], external = [];
const password = 'Fictional-Legacy-Upgrade-Password-2026!';
let mode = 'legacy';
const browser = await chromium.launch();
const contexts = [];
let currentPage;
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
const actions = request => request.action === 'schoolGateway' ? `v5:${request.operation}` : request.action;
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const savedConfig = (id, key = legacy.get(id).key) => ({ enabled: true, scriptUrl: endpoint(id), ...(key ? { adminKey: key } : {}) });
async function newPage(config = null) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  contexts.push(context);
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'script.google.com') {
      const id = /LegacyHostedFixtureSchool([AB])\/exec$/.exec(url.pathname)?.[1];
      assert.ok(id, 'No unexpected school endpoint is requested');
      assert.equal(route.request().method(), 'POST');
      const input = route.request().postDataJSON();
      assert.ok(!route.request().headers().cookie && !route.request().headers()['x-csrf-token']);
      if (input.action === 'healthCheck') {
        assert.deepEqual(input, { action: 'healthCheck' });
        assert.ok(!route.request().headers().referer, 'Public discovery does not disclose query token via referrer');
      }
      calls.push({ id, request: input, mode });
      let response;
      if (mode === 'unknown' && input.action === 'healthCheck') response = { status: 'success', data: { serverVersion: '', storageReady: true } };
      else if (mode === 'html' && input.action === 'healthCheck') return route.fulfill({ contentType: 'text/html', body: '<html><body>Google login required</body></html>', headers: { 'Access-Control-Allow-Origin': '*' } });
      else if (mode === 'mismatched-v5' && input.action === 'healthCheck') response = { status: 'success', data: { serverVersion: '5.3.8', storageReady: true, uiReady: false, uiVersion: '5.3.7' } };
      else if (mode === 'v5' && id === 'A') response = fixture.schools.get('A').dispatch(input);
      else response = legacy.get(id).dispatch(input);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response), headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
    }
    if (url.hostname !== 'localhost' && !['data:', 'blob:'].includes(url.protocol)) { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  if (config) await context.addInitScript(({ config, configKey }) => {
    if (location.hostname === 'localhost' && localStorage.getItem(configKey) === null) localStorage.setItem(configKey, JSON.stringify(config));
  }, { config, configKey });
  const page = await context.newPage();
  currentPage = page;
  return page;
}
async function open(page, id = null, extra = '') {
  const query = id ? `?endpoint=${encodeURIComponent(endpoint(id))}${extra}` : '';
  await page.goto(`${fixture.base}/hosted${query}`);
}
async function landing(page) {
  await page.getByRole('button', { name: '서명하기 (교직원용)', exact: true }).waitFor();
  await page.getByRole('button', { name: '관리자 모드', exact: true }).waitFor();
  assert.equal(await page.getByText('v4.0', { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('heading', { name: 'Google Drive 연동 안내', exact: true }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'v5 업데이트 안내', exact: true }).count(), 0);
}
async function admin(page) {
  await page.getByRole('button', { name: '관리자 모드', exact: true }).click();
  await page.getByRole('heading', { name: '관리자 대시보드', exact: true }).waitFor();
}
async function v5Login(page) {
  await page.getByRole('heading', { name: '가상 업데이트 학교 A 관리자 로그인', exact: true }).waitFor();
  await page.getByLabel('아이디', { exact: true }).fill('fictional-v5-admin');
  await page.getByLabel('암호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('heading', { name: '관리자 대시보드', exact: true }).waitFor();
}

try {
  const schoolA = legacy.get('A'), schoolB = legacy.get('B');
  const initialFiles = schoolA.files(), initialRows = schoolA.rows();
  const page = await newPage(savedConfig('A'));
  const before = calls.length;
  await open(page);
  await landing(page);
  assert.deepEqual(JSON.parse((await storage(page))[configKey]), savedConfig('A'));
  assert.equal(calls.slice(before).filter(call => call.request.action === 'healthCheck').length, 1);
  assert.ok(calls.slice(before).filter(call => call.request.action !== 'healthCheck').every(call => call.id === 'A' && call.request.adminKey === schoolA.key));
  assert.ok(!calls.slice(before).some(call => call.request.action === 'schoolGateway'));
  assert.deepEqual(schoolA.files(), initialFiles);
  assert.deepEqual(schoolA.rows(), initialRows);
  await page.screenshot({ path: 'docs/images/vfour-landing.png' });
  pass('A saved v4 school opens the familiar landing with one key-free version check, retains its key and preserves existing files');

  await admin(page);
  await page.getByRole('heading', { name: '가상 v4 A 기존 연수 1', exact: false }).waitFor();
  await page.getByText('✍️ 2명 서명', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'v5 업데이트 안내', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '관리자 계정', exact: true }).count(), 0);
  const mergedBefore = schoolA.sessions().find(session => session.id === 'legacy-A-1').signatures;
  assert.equal(mergedBefore.length, 2);
  assert.ok(mergedBefore.some(signature => signature.staffId === 'A-inline-person' && signature.signatureData.startsWith('data:image/png;')));
  assert.ok(mergedBefore.some(signature => signature.staffId === 'A-sheet-person' && signature.signatureData.startsWith('data:image/webp;')));
  await page.screenshot({ path: 'docs/images/vfour-admin.png', fullPage: true });
  await page.getByRole('button', { name: 'v5 업데이트 안내', exact: true }).click();
  const guide = page.getByRole('region', { name: 'v5 업데이트 안내', exact: true });
  await guide.waitFor();
  assert.equal(await guide.locator('ol > li').count(), 3);
  assert.equal(await guide.getByRole('link', { name: '업데이트 ZIP 다운로드', exact: true }).getAttribute('href'), 'https://github.com/skonT151216/teachersign-improved/releases/latest/download/TeacherSign-GAS.zip');
  assert.ok(!(await guide.innerText()).includes('setupTeacherSign'));
  await page.screenshot({ path: 'docs/images/vfour-update.png' });
  await guide.getByRole('button', { name: '닫기', exact: true }).click();
  pass('The v4 administrator sees real existing JSON and Sheets signatures and one concise, optional three-step update guide');

  await page.getByText('🏢 외부공개', { exact: true }).click();
  await page.getByPlaceholder('연수명', { exact: true }).fill('가상 v4 호환 저장 검증');
  await page.getByPlaceholder('기관명', { exact: true }).fill('가상 v4 학교 A');
  await page.locator('input[type=date]').fill('2026-10-14');
  const beforeWrite = calls.length;
  await page.getByRole('button', { name: '연수 등록', exact: true }).click();
  await page.getByRole('heading', { name: '가상 v4 호환 저장 검증', exact: false }).waitFor();
  const created = schoolA.sessions().find(session => session.title === '가상 v4 호환 저장 검증');
  assert.ok(created?.participantToken);
  assert.equal(calls.slice(beforeWrite).filter(call => call.request.action === 'createSession').length, 1);
  await page.reload(); await landing(page); await admin(page);
  await page.getByRole('heading', { name: '가상 v4 호환 저장 검증', exact: false }).waitFor();
  pass('The familiar v4 form writes through archived createSession and the saved training survives a full page reload');

  await page.getByRole('button', { name: '링크 공유', exact: true }).first().click();
  await page.locator('img[alt=QR]').waitFor();
  assert.match(await page.locator('img[alt=QR]').getAttribute('src'), /^data:image\/png;base64,/);
  const link = new URL(await page.locator('input[readonly]').inputValue());
  assert.equal(link.searchParams.get('endpoint'), endpoint('A'));
  assert.ok(link.searchParams.get('sessionId') && link.searchParams.get('token'));
  assert.ok(!link.href.includes(schoolA.key));
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  pass('V4 sharing uses a local QR and carries the native school endpoint/session/token without the administrator key');

  const participant = await newPage(savedConfig('B'));
  // The participant shares an origin with another school's saved administrator
  // config. Its explicit school must still win and all browser values must stay.
  await participant.goto(`${fixture.base}/hosted`);
  await landing(participant);
  const participantStorageBefore = await storage(participant);
  const schoolBBefore = { files: schoolB.files(), rows: schoolB.rows() };
  const beforeParticipant = calls.length;
  await open(participant, 'A', `&sessionId=legacy-A-1&token=${encodeURIComponent(schoolA.token)}`);
  await participant.getByRole('button', { name: /가상 A 참여 교사/ }).waitFor();
  assert.equal(await participant.getByRole('button', { name: '관리자 모드', exact: true }).count(), 0);
  assert.equal(await participant.getByRole('button', { name: 'v5 업데이트 안내', exact: true }).count(), 0);
  assert.equal(await participant.getByRole('heading', { name: 'Google Drive 연동 안내', exact: true }).count(), 0);
  await participant.getByRole('button', { name: /가상 A 참여 교사/ }).click();
  await participant.getByRole('button', { name: '출장', exact: true }).click();
  await participant.locator('.animate-pop-in').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await participant.getByRole('button', { name: '서명 완료', exact: true }).click();
  await participant.getByRole('button', { name: /가상 A 참여 교사.*서명완료/ }).waitFor();
  const participantCalls = calls.slice(beforeParticipant);
  assert.ok(participantCalls.every(call => call.id === 'A' && ['healthCheck', 'getParticipantSession', 'addParticipantSignature'].includes(call.request.action)));
  assert.ok(participantCalls.every(call => !call.request.adminKey && !call.request.setupKey && !call.request.sessionToken));
  assert.equal(participantCalls.filter(call => call.request.action === 'addParticipantSignature').length, 1);
  const signed = schoolA.sessions().filter(session => ['legacy-A-1', 'legacy-A-2'].includes(session.id));
  assert.ok(signed.every(session => session.signatures.some(signature => signature.staffId === 'A-new-person' && signature.signatureData.startsWith('data:image/webp;base64,'))));
  assert.equal(signed[0].signatures.length, 3);
  assert.deepEqual(await storage(participant), participantStorageBefore);
  assert.deepEqual({ files: schoolB.files(), rows: schoolB.rows() }, schoolBBefore);
  await participant.reload();
  await participant.getByRole('button', { name: /가상 A 참여 교사.*서명완료/ }).waitFor();
  pass('Anonymous v4 participation saves and rereads a real signature for both same-date trainings without admin requests or changing another saved school');

  const mismatch = await newPage(savedConfig('A'));
  const beforeMismatch = calls.length;
  await open(mismatch, 'B'); await landing(mismatch);
  await mismatch.getByRole('button', { name: '관리자 모드', exact: true }).click();
  await mismatch.getByRole('heading', { name: '기존 v4 학교 연결', exact: true }).waitFor();
  assert.ok(!calls.slice(beforeMismatch).some(call => call.request.adminKey));
  await mismatch.getByRole('button', { name: '구글 연동 설정', exact: true }).click();
  await mismatch.getByRole('heading', { name: '기존 v4 구글 연동 설정', exact: true }).waitFor();
  assert.equal(await mismatch.getByLabel('현재 학교 웹앱 주소', { exact: true }).inputValue(), endpoint('B'));
  assert.equal(await mismatch.getByLabel('학교 관리자 연결키', { exact: true }).inputValue(), '');
  assert.equal(await mismatch.getByLabel('학교 관리자 연결키', { exact: true }).getAttribute('type'), 'password');
  await mismatch.getByLabel('학교 관리자 연결키', { exact: true }).fill('incorrect-existing-key');
  await mismatch.getByRole('button', { name: '기존 학교 연결', exact: true }).click();
  await mismatch.getByRole('alert').filter({ hasText: '일치하지 않습니다' }).waitFor();
  await mismatch.getByLabel('학교 관리자 연결키', { exact: true }).fill(schoolB.key);
  await mismatch.getByRole('button', { name: '기존 학교 연결', exact: true }).click();
  await mismatch.getByRole('heading', { name: '관리자 대시보드', exact: true }).waitFor();
  await mismatch.getByRole('heading', { name: '가상 v4 B 기존 연수 1', exact: false }).waitFor();
  assert.deepEqual(JSON.parse((await storage(mismatch))[configKey]), savedConfig('B'));
  assert.ok(calls.slice(beforeMismatch).filter(call => call.request.adminKey).every(call => call.id === 'B' && call.request.adminKey !== schoolA.key));
  assert.deepEqual({ files: schoolB.files(), rows: schoolB.rows() }, schoolBBefore);
  pass('An explicitly selected school never receives a different saved school key; a short reconnect form verifies the existing key without setup or data changes');

  const missing = await newPage(savedConfig('A', ''));
  const beforeMissing = calls.length;
  await open(missing); await landing(missing);
  await missing.getByRole('button', { name: '관리자 모드', exact: true }).click();
  await missing.getByRole('heading', { name: '기존 v4 학교 연결', exact: true }).waitFor();
  assert.ok(!calls.slice(beforeMissing).some(call => call.request.action !== 'healthCheck'));
  assert.ok(!(await missing.locator('body').innerText()).includes('setupTeacherSign'));
  pass('A previously removed v4 key yields a concise existing-connection action, without attempting setup or silently substituting local sessions');

  const unknown = await newPage(savedConfig('A'));
  for (const scenario of ['unknown', 'html', 'mismatched-v5']) {
    mode = scenario;
    const beforeUnknown = calls.length;
    await open(unknown, 'A');
    await unknown.getByRole('alert').waitFor();
    assert.equal(await unknown.getByRole('button', { name: '관리자 모드', exact: true }).count(), 0);
    assert.equal(await unknown.getByLabel('아이디', { exact: true }).count(), 0);
    assert.ok(calls.slice(beforeUnknown).every(call => call.request.action === 'healthCheck'));
    assert.deepEqual(JSON.parse((await storage(unknown))[configKey]), savedConfig('A'));
  }
  pass('Unknown, Google HTML and mismatched Code/Index responses stop at connection errors without guessing a version, clearing the old key or issuing admin requests');

  // This fixture represents a school that has completed its own v5 upgrade and
  // retained its data. The common frontend performs no automatic migration.
  mode = 'legacy';
  const upgraded = fixture.schools.get('A');
  assert.equal(upgraded.rpc({ operation: 'bootstrap', setupKey: fixture.setupKey, username: 'fictional-v5-admin', label: '가상 업데이트 학교 A', passwordHash: await hashPassword(password) }).status, 'success');
  const oldDB = schoolA.files().find(file => file.name === 'TrainingApp_DB.json');
  upgraded.shared.files.get(upgraded.props.get('TEACHERSIGN_DB_FILE_ID')).content = oldDB.content;
  const v5Sheet = upgraded.context.getSignatureSheet_();
  schoolA.rows().slice(1).forEach(row => v5Sheet.appendRow(row));
  await page.getByRole('button', { name: 'v5 업데이트 안내', exact: true }).click();
  const beforeUpgrade = calls.length;
  mode = 'v5';
  await page.getByRole('button', { name: '업데이트 완료 확인', exact: true }).click();
  await page.getByRole('heading', { name: '가상 업데이트 학교 A 관리자 로그인', exact: true }).waitFor();
  const discovery = calls.slice(beforeUpgrade);
  assert.ok(discovery.some(call => call.request.action === 'healthCheck'));
  assert.ok(discovery.some(call => call.request.action === 'schoolGateway' && call.request.operation === 'info'));
  assert.ok(!discovery.some(call => call.request.adminKey || ['bootstrap', 'admin', 'login'].includes(call.request.operation)));
  assert.equal(JSON.parse((await storage(page))[configKey]).adminKey, undefined);
  assert.equal((await storage(page))[urlKey], endpoint('A'));
  await v5Login(page);
  await page.getByRole('heading', { name: '가상 v4 A 기존 연수 1', exact: false }).waitFor();
  await page.getByText('✍️ 3명 서명', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'v5 업데이트 안내', exact: true }).count(), 0);
  assert.ok(!calls.slice(beforeUpgrade).some(call => call.request.adminKey));
  const fileIdsBeforeReload = [...upgraded.shared.files.keys()];
  await page.reload();
  await page.getByRole('heading', { name: '가상 업데이트 학교 A 관리자 로그인', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '관리자 모드', exact: true }).count(), 0);
  assert.deepEqual([...upgraded.shared.files.keys()], fileIdsBeforeReload);
  pass('After a school upgrade, explicit version check and later reload select the real v5 login/API, retain the same address and existing data, and never replay v4 writes');

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  pass('All browser flows use fictional local schools and generate no page errors or live external requests');
} catch (error) {
  if (currentPage) await currentPage.screenshot({ path: 'artifacts/legacy-hosted-failure.png', fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('artifacts/legacy-hosted-results.json', JSON.stringify({ checks, pageErrors: errors, externalRequests: external, requestActions: calls.map(call => ({ school: call.id, mode: call.mode, action: actions(call.request) })), passed: !process.exitCode }, null, 2));
  await browser.close();
  await fixture.stop();
}

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = new URL(process.env.TEACHERSIGN_PUBLIC_URL || 'https://teachersign-schools-test-20261003.vercel.app').origin;
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
const errors = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

try {
  assert.equal((await context.cookies()).length, 0);
  await page.goto(base);
  assert.equal(new URL(page.url()).origin, base, 'Use a public app URL that does not redirect to Vercel authentication');
  await page.getByRole('heading', { name: '교직원 연수 등록부 · 학교 연결' }).waitFor();
  await page.getByRole('button', { name: '새 학교 설치', exact: true }).click();
  await page.getByLabel('학교 관리자 연결키', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'v5 GAS 코드 복사', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '코드 내려받기', exact: true }).count(), 1);
  // Invalid/missing credentials are rejected before any school GAS request.
  const api = await page.evaluate(async () => {
    const runtime = await fetch('/api/runtime').then(r => r.json());
    const unauthorized = await fetch('/api/auth/session?school=DEPLOYMENT_SMOKE_TEST');
    const invalid = await fetch('/api/auth/login?school=DEPLOYMENT_SMOKE_TEST', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    return { runtime, unauthorized: unauthorized.status, invalid: invalid.status };
  });
  assert.deepEqual(api, { runtime: { mode: 'gas', ready: true }, unauthorized: 401, invalid: 400 });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'artifacts/vercel-school-install.png', fullPage: true });
  await writeFile('artifacts/vercel-smoke-results.json', JSON.stringify({ passed: true, url: base, target: 'public', api, errors }, null, 2));
  console.log('PASS public app: anonymous installation UI, v5 code controls, ready API and administrator authentication');
} finally {
  await browser.close();
}

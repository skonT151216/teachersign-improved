import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_VERSION, compareVersions, fetchLatestUpdate, fetchLatestGasCode, validateUpdate, VERSION_URL, GAS_CODE_URL } from '../services/updateService.mjs';
const release = { appVersion: '5.1.0', gasVersion: '5.0.1', publishedAt: '2026-10-09', notes: '보안 및 업데이트 안내 개선' };

test('updates compare numeric versions and distinguish current/newer installs', () => {
  assert.equal(compareVersions('5.9.0', '5.10.0'), -1);
  assert.equal(compareVersions('5.0.0', '5.0.1'), -1);
  assert.equal(compareVersions('5.0.0', '5.0.0'), 0);
  assert.equal(compareVersions('6.0.0', '5.10.0'), 1);
  assert.throws(() => compareVersions('5.0.0-beta', '5.0.0'));
});
test('release metadata rejects incomplete versions and discards external navigation', () => {
  assert.throws(() => validateUpdate({ ...release, gasVersion: '<script>' }));
  assert.throws(() => validateUpdate({ ...release, appVersion: ['5.1.0'] }));
  assert.throws(() => validateUpdate({ ...release, notes: null }));
  assert.deepEqual(validateUpdate({ ...release, downloadUrl: 'https://example.com/unknown.zip' }), release);
});
test('GitHub fetch sends no school credentials and HTTP/JSON failures remain failures', async () => {
  const signal = new AbortController().signal;
  const value = await fetchLatestUpdate(signal, async (url, options) => {
    assert.equal(url, VERSION_URL);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.signal, signal);
    return new Response(JSON.stringify(release));
  });
  assert.deepEqual(value, release);
  await assert.rejects(fetchLatestUpdate(signal, async () => new Response('', { status: 404 })));
  await assert.rejects(fetchLatestUpdate(signal, async () => new Response('{')));
});
test('published manifest, app and package versions agree', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, APP_VERSION);
});

test('connection guide reads only official public code and metadata, without school credentials', async () => {
  const signal = new AbortController().signal;
  const source = '// TeacherSign Google Apps Script server v5.0.1\nconst SERVER_VERSION = "5.0.1";\nfunction doGet() {}\n';
  const urls = [];
  const result = await fetchLatestGasCode(signal, async (url, options) => {
    urls.push(url);
    assert.equal(options.credentials,'omit');
    assert.equal(options.referrerPolicy,'no-referrer');
    assert.equal(options.signal,signal);
    assert.equal(options.body,undefined);
    assert.equal(options.headers,undefined);
    return new Response(url === VERSION_URL ? JSON.stringify(release) : source);
  });
  assert.deepEqual(urls.sort(),[GAS_CODE_URL,VERSION_URL].sort());
  assert.deepEqual(result,{version:'5.0.1',source});
});

test('connection guide refuses mismatched versions, unexpected or excessive code and GitHub failures', async () => {
  const signal = new AbortController().signal;
  for (const source of [
    '// TeacherSign Google Apps Script server v5.0.0\nconst SERVER_VERSION = "5.0.0";',
    '<html>Sign in to download</html>',
    '// TeacherSign Google Apps Script server\nconst SERVER_VERSION = "5.0.1";'+ ' '.repeat(500001),
  ]) await assert.rejects(fetchLatestGasCode(signal,async url => new Response(url === VERSION_URL ? JSON.stringify(release) : source)), /일치하지 않습니다/);
  await assert.rejects(fetchLatestGasCode(signal,async url => url === VERSION_URL ? new Response(JSON.stringify(release)) : new Response('',{status:404})), /확인하지 못했습니다/);
});

test('closing the guide aborts public code requests instead of completing a stale read', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchLatestGasCode(controller.signal,async (_url,options) => { options.signal.throwIfAborted(); }), error => error.name === 'AbortError');
});

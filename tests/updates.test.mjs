import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_VERSION, compareVersions, fetchLatestUpdate, validateUpdate, VERSION_URL } from '../services/updateService.mjs';
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

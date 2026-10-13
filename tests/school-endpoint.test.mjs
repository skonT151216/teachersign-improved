import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolEndpoint, initialSchoolEndpoint, rememberSchoolEndpoint, classifySchoolHealth, assertCompatibleGas, schoolInfoCompatibilityError, validParticipantEndpoint, SCHOOL_URL_KEY } from '../services/schoolEndpoint.mjs';
import { discoverSchoolVersion } from '../services/schoolDiscovery.ts';
import { createGasHarness } from './gas-harness.mjs';
const endpoint = 'https://script.google.com/macros/s/FixtureSchoolEndpointA/exec';
function storage(entries) {
  const values = new Map(Object.entries(entries));
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), values };
}
test('hosted school selection accepts canonical Google deployment URLs only', () => {
  assert.equal(schoolEndpoint(` ${endpoint} `), endpoint);
  for (const value of [endpoint + '?action=info', endpoint + '#token', endpoint.replace('script.google.com', 'script.google.com.evil.test'), endpoint.replace('https:', 'http:'), 'javascript:alert(1)', endpoint.replace('/exec', '/dev'), endpoint.replace('script.google.com', 'user:password@script.google.com')]) assert.equal(schoolEndpoint(value), '');
});
test('participant selection never falls back to a saved or legacy school', () => {
  const legacy = storage({ training_app_cloud_config: JSON.stringify({ scriptUrl: endpoint, adminKey: 'existing-v4-private-key' }) });
  assert.equal(initialSchoolEndpoint('', legacy), endpoint);
  assert.equal(initialSchoolEndpoint('?sessionId=test', legacy), '');
  assert.equal(initialSchoolEndpoint('?endpoint=https://evil.test', legacy), '');
  const other = endpoint.replace('EndpointA', 'EndpointB');
  assert.equal(initialSchoolEndpoint(`?sessionId=test&endpoint=${encodeURIComponent(other)}&token=participant-token`, legacy), other);
  assert.equal(initialSchoolEndpoint(`?endpoint=${encodeURIComponent(other)}`, legacy), other);
  assert.equal(legacy.getItem(SCHOOL_URL_KEY), null);
  assert.equal(JSON.parse(legacy.getItem('training_app_cloud_config')).adminKey, 'existing-v4-private-key');
});
test('discovery and known v4 keep the same school key; only positive v5 detection removes it', () => {
  const config = { enabled: true, scriptUrl: endpoint, adminKey: 'existing-v4-private-key' };
  const legacy = storage({ training_app_cloud_config: JSON.stringify(config) });
  rememberSchoolEndpoint(legacy, endpoint);
  assert.equal(legacy.getItem(SCHOOL_URL_KEY), endpoint);
  assert.deepEqual(JSON.parse(legacy.getItem('training_app_cloud_config')), config);
  rememberSchoolEndpoint(legacy, endpoint, 4);
  assert.deepEqual(JSON.parse(legacy.getItem('training_app_cloud_config')), config);
  rememberSchoolEndpoint(legacy, endpoint, 5);
  assert.deepEqual(JSON.parse(legacy.getItem('training_app_cloud_config')), { enabled: true, scriptUrl: endpoint });
});
test('selecting another school preserves the original v4 connection without moving its key', () => {
  const config = { enabled: true, scriptUrl: endpoint, adminKey: 'school-a-only-key' };
  const legacy = storage({ training_app_cloud_config: JSON.stringify(config) });
  const other = endpoint.replace('EndpointA', 'EndpointB');
  rememberSchoolEndpoint(legacy, other, 4);
  assert.equal(legacy.getItem(SCHOOL_URL_KEY), other);
  assert.deepEqual(JSON.parse(legacy.getItem('training_app_cloud_config')), config);
  rememberSchoolEndpoint(legacy, other, 5);
  assert.equal(legacy.getItem(SCHOOL_URL_KEY), other);
  assert.deepEqual(JSON.parse(legacy.getItem('training_app_cloud_config')), config);
  rememberSchoolEndpoint(legacy, endpoint, 4);
  assert.deepEqual(JSON.parse(legacy.getItem('training_app_cloud_config')), config);
  const malformed = storage({ training_app_cloud_config: 'not-json' });
  rememberSchoolEndpoint(malformed, other, 4);
  assert.equal(malformed.getItem('training_app_cloud_config'), 'not-json');
});
test('explicit supported health version selects the matching UI and rejects unknown or mismatched state', () => {
  const health = data => ({ status: 'success', data });
  assert.deepEqual(classifySchoolHealth(health({ serverVersion: '4.0.0', storageReady: true, adminKeyConfigured: true })), { major: 4, serverVersion: '4.0.0' });
  assert.deepEqual(classifySchoolHealth(health({ serverVersion: '5.3.7', storageReady: true })), { major: 5, serverVersion: '5.3.7' });
  assert.deepEqual(classifySchoolHealth(health({ serverVersion: '5.3.8', storageReady: true, uiReady: true })), { major: 5, serverVersion: '5.3.8' });
  for (const result of [{}, { status: 'success', data: null }, health({ serverVersion: '4', storageReady: true }), health({ serverVersion: '6.0.0', storageReady: true }), health({ serverVersion: '4.0.0', storageReady: 'true' }), health({ serverVersion: '5.3.8', storageReady: true, uiReady: 'true' })])
    assert.throws(() => classifySchoolHealth(result), /ERR-(?:GAS|VERSION)/);
  assert.throws(() => classifySchoolHealth(health({ serverVersion: '5.3.8', storageReady: true, uiReady: false })), /ERR-VERSION.*Code.gs.*Index.html/);
  assert.throws(() => classifySchoolHealth(health({ serverVersion: '5.3.8', storageReady: false })), /ERR-SCHOOL-SETUP/);
  assert.throws(() => classifySchoolHealth({ status: 'error', message: '[ERR-ADMIN-KEY] real failure' }), /ERR-ADMIN-KEY/);
});
test('version discovery makes one credential-free health request and never falls back after errors', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ status: 'success', data: { serverVersion: '4.0.0', storageReady: true } }), { status: 200 });
  };
  try {
    assert.deepEqual(await discoverSchoolVersion(endpoint, new AbortController().signal), { major: 4, serverVersion: '4.0.0' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, endpoint);
    assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'healthCheck' });
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
    assert.deepEqual(calls[0].options.headers, { 'Content-Type': 'text/plain;charset=utf-8' });
    let retries = 0;
    globalThis.fetch = async () => { retries++; throw new TypeError('Failed to fetch'); };
    await assert.rejects(discoverSchoolVersion(endpoint, new AbortController().signal), /ERR-GAS-NETWORK/);
    assert.equal(retries, 1);
    globalThis.fetch = async () => new Response('<html>Google sign in</html>', { status: 200 });
    await assert.rejects(discoverSchoolVersion(endpoint, new AbortController().signal), /ERR-GAS-JSON/);
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'error', message: '[ERR-ADMIN-KEY] no fallback' }));
    await assert.rejects(discoverSchoolVersion(endpoint, new AbortController().signal), /ERR-ADMIN-KEY/);
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(discoverSchoolVersion(endpoint, aborted.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; }
});
test('protocol negotiation accepts compatible v5 installations and rejects conflicting versions without writes', () => {
  assert.doesNotThrow(() => assertCompatibleGas({ serverVersion: '5.1.1', accountConfigured: false }));
  assert.doesNotThrow(() => assertCompatibleGas({ serverVersion: '6.0.0', apiVersion: 1, accountConfigured: true }));
  for (const info of [{ serverVersion: '4.0.0', accountConfigured: true }, { serverVersion: '5.2.0', apiVersion: 2, accountConfigured: true }, { serverVersion: '5.2.0', accountConfigured: 'false' }]) assert.throws(() => assertCompatibleGas(info), /ERR-VERSION/);
  assert.throws(() => assertCompatibleGas({ serverVersion: '5.3.8', apiVersion: 1, accountConfigured: true, uiReady: false }), /ERR-VERSION.*Code.gs.*Index.html/);
  const gas = createGasHarness();
  const before = gas.shared.files.get(gas.props.get('TEACHERSIGN_AUTH_FILE_ID')).content;
  const incompatible = gas.dispatch({ action: 'schoolGateway', operation: 'bootstrap', protocolVersion: 2 });
  assert.match(incompatible.message, /ERR-VERSION/);
  assert.equal(gas.shared.files.get(gas.props.get('TEACHERSIGN_AUTH_FILE_ID')).content, before);
  assert.equal(gas.dispatch({ action: 'schoolGateway', operation: 'info', protocolVersion: 1 }).data.apiVersion, 1);
});
test('hosted participant requests stay bound to the explicit selected school', () => {
  const runtime = { transport: 'http', webAppUrl: endpoint };
  assert.equal(validParticipantEndpoint(endpoint, runtime), true);
  assert.equal(validParticipantEndpoint(endpoint.replace('EndpointA', 'EndpointB'), runtime), false);
  assert.equal(validParticipantEndpoint('/api/participant', runtime), false);
  assert.equal(validParticipantEndpoint('/api/participant', { webAppUrl: endpoint }), true);
});

test('real v4 rejects a v5 info request before action dispatch; only initial discovery shows upgrade help', async () => {
  const { readFile } = await import('node:fs/promises');
  const { default: vm } = await import('node:vm');
  const source = await readFile(new URL('../gas/legacy/TeacherSignV4.gs',import.meta.url),'utf8');
  const context = vm.createContext({ PropertiesService:{ getScriptProperties:()=>({getProperty:()=> 'fictional-saved-v4-key'}) }, ContentService:{ createTextOutput:text=>({setMimeType:()=>({getContent:()=>text})}),MimeType:{JSON:'json'} } });
  vm.runInContext(source,context);
  const result=JSON.parse(context.doPost({postData:{contents:JSON.stringify({action:'schoolGateway',operation:'info',protocolVersion:1})}}).getContent());
  assert.equal(result.status,'error');
  assert.match(result.message,/^\[ERR-ADMIN-KEY\]/);
  assert.match(schoolInfoCompatibilityError('info',result),/^\[ERR-VERSION\].*Code.gs.*Index.html/);
  for (const operation of ['bootstrap','connectionTest','admin','login','participant']) assert.equal(schoolInfoCompatibilityError(operation,result),'');
  for (const code of ['ERR-ACTION','ERR-ACTION-01','ERR-ADMIN-SETUP']) assert.match(schoolInfoCompatibilityError('info',{status:'error',message:`[${code}] old request`}),/^\[ERR-VERSION\]/);
  for (const message of ['[ERR-GAS-NETWORK] inaccessible','[ERR-SCHOOL-SETUP] missing storage','[ERR-ADMIN-KEY-OTHER] unknown']) assert.equal(schoolInfoCompatibilityError('info',{status:'error',message}),'');
  assert.equal(schoolInfoCompatibilityError('info',{status:'success',message:result.message}),'');
});

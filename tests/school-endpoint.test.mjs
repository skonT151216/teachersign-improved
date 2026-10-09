import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolEndpoint, initialSchoolEndpoint, rememberSchoolEndpoint, assertCompatibleGas, validParticipantEndpoint, SCHOOL_URL_KEY } from '../services/schoolEndpoint.mjs';
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
test('participant selection never falls back to a saved or legacy school and migration stores public URL only', () => {
  const legacy = storage({ training_app_cloud_config: JSON.stringify({ scriptUrl: endpoint, adminKey: 'obsolete-private-key' }) });
  assert.equal(initialSchoolEndpoint('', legacy), endpoint);
  assert.equal(initialSchoolEndpoint('?sessionId=test', legacy), '');
  assert.equal(initialSchoolEndpoint('?endpoint=https://evil.test', legacy), '');
  rememberSchoolEndpoint(legacy, endpoint);
  assert.equal(legacy.getItem(SCHOOL_URL_KEY), endpoint);
  assert.deepEqual(JSON.parse(legacy.getItem('training_app_cloud_config')), { enabled: true, scriptUrl: endpoint });
});
test('protocol negotiation accepts compatible v5 installations and rejects conflicting versions without writes', () => {
  assert.doesNotThrow(() => assertCompatibleGas({ serverVersion: '5.1.1', accountConfigured: false }));
  assert.doesNotThrow(() => assertCompatibleGas({ serverVersion: '6.0.0', apiVersion: 1, accountConfigured: true }));
  for (const info of [{ serverVersion: '4.0.0', accountConfigured: true }, { serverVersion: '5.2.0', apiVersion: 2, accountConfigured: true }, { serverVersion: '5.2.0', accountConfigured: 'false' }]) assert.throws(() => assertCompatibleGas(info), /ERR-VERSION/);
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

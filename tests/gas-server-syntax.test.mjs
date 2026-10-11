import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertGasServerSyntax } from '../scripts/gas-server-syntax.mjs';

test('GAS installer rejects logical assignment even when Node accepts it', () => {
  for (const operator of ['||=', '&&=', '??=']) {
    const source = `function count(rows) { const bySession = {};\n rows.forEach(row => { (bySession[String(row[0])] ${operator} []).push(row); }); }`;
    assert.throws(() => assertGasServerSyntax(source), error => error instanceof SyntaxError && error.message.includes('Code.gs:2:') && error.message.includes(operator));
  }
  assert.throws(() => assertGasServerSyntax('function broken( {'), SyntaxError);
});

test('syntax guard allows ordinary initialization and operator text in strings or comments', () => {
  assert.doesNotThrow(() => assertGasServerSyntax('function count(rows) { const bySession = {}; rows.forEach(row => { const id = String(row[0]); if (!bySession[id]) bySession[id] = []; bySession[id].push(row); }); return bySession; }'));
  assert.doesNotThrow(() => assertGasServerSyntax('const help = "||= &&= ??="; // value ||= defaultValue\nconst pattern = /\\|\\|=/;'));
});

test('canonical and published server files share compatible GAS source', async () => {
  const root = new URL('../', import.meta.url);
  const canonical = await readFile(new URL('Code.gs', root), 'utf8');
  for (const name of ['Code.gs', 'gas/standalone/Code.gs', 'gas/TeacherSignV5.gs']) {
    const source = await readFile(new URL(name, root), 'utf8');
    assertGasServerSyntax(source, name);
    assert.equal(source, canonical, `${name} must match the tested source`);
  }
  const version = JSON.parse(await readFile(new URL('version.json', root), 'utf8'));
  assert.ok(canonical.includes(`const SERVER_VERSION = "${version.gasVersion}"`));
});

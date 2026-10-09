import { build } from 'vite';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { zipSync } from 'fflate';
const root = new URL('../', import.meta.url);
await build();
await writeFile(new URL('dist/version.json', root), await readFile(new URL('version.json', root)));
await writeFile(new URL('dist/THIRD-PARTY-LICENSES.txt', root), await readFile(new URL('gas/standalone/THIRD-PARTY-LICENSES.txt', root)));
const files = {};
async function collect(prefix = '') {
  for (const entry of await readdir(new URL(`dist/${prefix}`, root), { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await collect(name + '/');
    else files[name] = new Uint8Array(await readFile(new URL(`dist/${name}`, root)));
  }
}
await collect();
const version = JSON.parse(await readFile(new URL('version.json', root), 'utf8'));
await mkdir(new URL('artifacts/releases/', root), { recursive: true });
await writeFile(new URL('artifacts/releases/TeacherSign-Site.zip', root), zipSync(files, { level: 9, mtime: new Date(`${version.publishedAt}T00:00:00Z`) }));
console.log(`Site ${version.appVersion}: ${Object.keys(files).length} public assets, Cloudflare upload ZIP ready`);

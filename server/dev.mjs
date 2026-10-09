import { spawn } from 'node:child_process';
import { createDemoServer } from './http.mjs';
import { DemoStore } from './demo-store.mjs';

// Intentionally has no live mode or environment credential loading.
const { server } = await createDemoServer({ store: new DemoStore({ stateFile: '.teachersign-demo/state.json' }) });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8787, '127.0.0.1', resolve); });
console.log('TeacherSign mock API: loopback port 8787; no live Google connection');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5178', '--strictPort'], { stdio: 'inherit' });
const stop = () => { vite.kill('SIGTERM'); server.close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', code => { server.close(); process.exitCode = code || 0; });

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createSchoolGateway } from "../server/school-gateway.mjs";
import { createGasHarness, createFakeDrive, gasFetch } from "./gas-harness.mjs";
const drive = createFakeDrive();
const a = createGasHarness("BROWSER_SCHOOL_A_0001", drive);
const b = createGasHarness("BROWSER_SCHOOL_B_0002", drive);
const schools = new Map([
  ["BROWSER_SCHOOL_A_0001", a],
  ["BROWSER_SCHOOL_B_0002", b],
]);
const handler = createSchoolGateway({
  secret: "ab".repeat(32),
  origins: ["http://localhost:5179"],
  fetchImpl: gasFetch(schools),
});
function resetFixtures() {
  const drive = createFakeDrive();
  for (const id of ['BROWSER_SCHOOL_A_0001', 'BROWSER_SCHOOL_B_0002']) {
    const gas = createGasHarness(id, drive);
    gas.props.set('TEACHERSIGN_ADMIN_KEY', 'Browser-Demo-Only-Setup-Key-2026!000');
    schools.set(id, gas);
  }
}
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__reset-fixtures') {
    resetFixtures(); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}');
  }
  return handler(req, res);
});
await new Promise((resolve) => server.listen(8788, "127.0.0.1", resolve));
// The test setup keys are fixed public fixtures; no real key or Google request.
for (const gas of [a, b])
  gas.props.set(
    "TEACHERSIGN_ADMIN_KEY",
    "Browser-Demo-Only-Setup-Key-2026!000",
  );
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "localhost",
    "--port",
    "5179",
    "--strictPort",
  ],
  { stdio: "inherit", env: { ...process.env, TEACHERSIGN_API_PORT: "8788" } },
);
console.log(
  "Isolated school browser fixture: http://localhost:5179; no Google requests",
);
const stop = () => {
  vite.kill("SIGTERM");
  server.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", () => server.close());

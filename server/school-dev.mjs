import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createSchoolGateway } from "./school-gateway.mjs";
const server = createServer(
  createSchoolGateway({
    secret:
      process.env.TEACHERSIGN_COOKIE_SECRET || randomBytes(32).toString("hex"),
    origins: ["http://localhost:5178"],
  }),
);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(8787, "127.0.0.1", resolve);
});
console.log(
  "TeacherSign school gateway: localhost:5178. Google requests occur only after school setup/link input.",
);
console.log(
  "Local-only cookie secret is temporary unless configured; use a stable server secret on Vercel.",
);
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "localhost",
    "--port",
    "5178",
    "--strictPort",
  ],
  { stdio: "inherit" },
);
const stop = () => {
  vite.kill("SIGTERM");
  server.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", (code) => {
  server.close();
  process.exitCode = code || 0;
});

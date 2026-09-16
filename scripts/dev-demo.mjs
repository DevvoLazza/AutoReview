import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
if (!existsSync(new URL("../apps/api/dist/main.js", import.meta.url))) {
  console.error("Build the workspace first: pnpm build");
  process.exit(1);
}
const env = {
  ...process.env,
  NODE_ENV: "development",
  AUTH_MODE: "demo",
  WEB_AUTH_MODE: "demo",
  STORAGE_MODE: "memory",
  GOOGLE_MODE: "mock",
  AI_MODE: "mock",
  TASKS_MODE: "demo",
  EMBEDDING_MODE: "demo",
  GOOGLE_KMS_KEY_NAME: "",
  TOKEN_ENCRYPTION_KEY: "",
  AUTOMATION_RELEASE_APPROVED: "false",
  PORT: "4100",
  API_INTERNAL_URL: "http://localhost:4100/v1",
  WEB_ORIGIN: "http://localhost:3000",
};
const children = [
  spawn(process.execPath, ["apps/api/dist/main.js"], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    [
      fileURLToPath(new URL("../apps/web/node_modules/next/dist/bin/next", import.meta.url)),
      "dev",
      "--port",
      "3000",
    ],
    { cwd: `${root}apps/web`, env, stdio: "inherit", windowsHide: true },
  ),
];
// Next's executable path is absolute because its cwd is the web workspace.
children[1].on("error", stop);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32")
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill();
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const child of children)
  child.on("exit", (code) => {
    stop();
    if (code) process.exitCode = code;
  });
console.info(
  "Explicit demo at http://localhost:3000 — simulated Google/AI, volatile data, no real publication.",
);

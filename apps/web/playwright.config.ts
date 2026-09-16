import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: existsSync(edge) ? { executablePath: edge } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-web", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    {
      command: `"${process.execPath}" ../api/dist/main.js`,
      url: "http://localhost:4101/v1/health",
      env: {
        NODE_ENV: "development",
        AUTH_MODE: "demo",
        STORAGE_MODE: "memory",
        GOOGLE_MODE: "mock",
        AI_MODE: "mock",
        TASKS_MODE: "demo",
        AUTOMATION_RELEASE_APPROVED: "false",
        PORT: "4101",
      },
      timeout: 30_000,
    },
    {
      command: `"${process.execPath}" node_modules/next/dist/bin/next dev --port 3101`,
      url: "http://localhost:3101/api/session",
      env: { WEB_AUTH_MODE: "demo", API_INTERNAL_URL: "http://localhost:4101/v1" },
      timeout: 60_000,
    },
  ],
});

import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "server-only": "next/dist/compiled/server-only/empty.js" } },
  test: { include: ["test/**/*.test.ts"] },
});

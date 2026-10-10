import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["local/test/**/*.test.ts"], root: process.cwd() },
});

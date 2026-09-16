import { defineConfig } from "@playwright/test";
export default defineConfig({
  timeout: 120000,
  testDir: "tests/e2e",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8787",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : {},
  },
  webServer: {
    command: "npm run dev -- --port 8787",
    url: "http://127.0.0.1:8787/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  reporter: "list",
});
